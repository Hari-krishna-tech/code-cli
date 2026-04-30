import { readFile, readdir, stat } from "node:fs/promises";
import { join, extname, relative } from "node:path";
import { type Tool, type ToolResult } from "./types.js";
import { type Config, resolvePath } from "../utils/config.js";
import { isWithinWorkingDir } from "./read-file.js";

const MAX_FILE_SIZE = 1024 * 1024; // 1MB
const MAX_RESULTS = 50;

export function createSearchTool(config: Config): Tool {
  return {
    definition: {
      name: "search",
      description:
        "Search for a pattern in files. Like grep. Returns matching lines with file paths and line numbers.",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "The text or regex pattern to search for.",
          },
          path: {
            type: "string",
            description:
              "Directory to search in. Defaults to working directory.",
          },
          fileTypes: {
            type: "string",
            description:
              "Comma-separated file extensions to filter (e.g., '.ts,.js,.json').",
          },
        },
        required: ["pattern"],
      },
    },
    async execute(params): Promise<ToolResult> {
      const pattern = params.pattern as string;
      const searchPath = resolvePath(
        config,
        (params.path as string) || ".",
      );
      const fileTypes = params.fileTypes
        ? (params.fileTypes as string).split(",").map((s) => s.trim())
        : null;

      if (!isWithinWorkingDir(config.workingDirectory, searchPath)) {
        return {
          success: false,
          output: "",
          error: `Access denied: path "${searchPath}" is outside working directory.`,
        };
      }

      try {
        let regex: RegExp;
        try {
          regex = new RegExp(pattern, "gi");
        } catch {
          regex = new RegExp(escapeRegex(pattern), "gi");
        }

        const results = await searchDir(searchPath, regex, fileTypes, config.workingDirectory);

        if (results.length === 0) {
          return {
            success: true,
            output: `No matches found for "${pattern}" in ${searchPath}`,
          };
        }

        const truncated =
          results.length > MAX_RESULTS
            ? results.slice(0, MAX_RESULTS)
            : results;
        const header = `Found ${results.length} matches for "${pattern}" in ${searchPath}${results.length > MAX_RESULTS ? ` (showing first ${MAX_RESULTS})` : ""}\n${"-".repeat(60)}\n`;

        return { success: true, output: header + truncated.join("\n") };
      } catch (err) {
        return {
          success: false,
          output: "",
          error: `Search failed: ${(err as Error).message}`,
        };
      }
    },
  };
}

async function searchDir(
  dir: string,
  regex: RegExp,
  fileTypes: string[] | null,
  workDir: string,
): Promise<string[]> {
  const results: string[] = [];
  const items = await readdir(dir, { withFileTypes: true });

  for (const item of items) {
    if (results.length >= MAX_RESULTS) break;

    const fullPath = join(dir, item.name);

    if (item.isDirectory()) {
      if (item.name === "node_modules" || item.name.startsWith(".git")) continue;
      const sub = await searchDir(fullPath, regex, fileTypes, workDir);
      results.push(...sub);
    } else if (item.isFile()) {
      if (fileTypes && !fileTypes.includes(extname(item.name))) continue;

      try {
        const s = await stat(fullPath);
        if (s.size > MAX_FILE_SIZE) continue;

        const content = await readFile(fullPath, "utf-8");
        const lines = content.split("\n");

        for (let i = 0; i < lines.length; i++) {
          if (results.length >= MAX_RESULTS) break;
          if (regex.test(lines[i])) {
            regex.lastIndex = 0;
            const relPath = relative(workDir, fullPath);
            results.push(
              `${relPath}:${i + 1}: ${lines[i].trim().slice(0, 200)}`,
            );
          }
        }
      } catch {
        // skip unreadable files
      }
    }
  }

  return results;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
