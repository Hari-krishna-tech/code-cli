import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { type Tool, type ToolResult } from "./types.js";
import { type Config, resolvePath } from "../utils/config.js";
import { isWithinWorkingDir } from "./read-file.js";

export function createListFilesTool(config: Config): Tool {
  return {
    definition: {
      name: "list_files",
      description: "List files and directories in a given directory.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "The directory path to list. Defaults to current directory.",
          },
          recursive: {
            type: "boolean",
            description: "Whether to list recursively. Default false.",
          },
        },
        required: [],
      },
    },
    async execute(params): Promise<ToolResult> {
      const rawPath = (params.path as string) || ".";
      const recursive = params.recursive === true;
      const resolved = resolvePath(config, rawPath);

      if (!isWithinWorkingDir(config.workingDirectory, resolved)) {
        return {
          success: false,
          output: "",
          error: `Access denied: path "${resolved}" is outside working directory.`,
        };
      }

      try {
        const entries = await listDir(resolved, config.workingDirectory, recursive);
        const header = `Directory: ${resolved} (${entries.length} entries)\n${"-".repeat(60)}\n`;
        return { success: true, output: header + entries.join("\n") };
      } catch (err) {
        return {
          success: false,
          output: "",
          error: `Cannot list "${resolved}": ${(err as Error).message}`,
        };
      }
    },
  };
}

async function listDir(
  dir: string,
  workDir: string,
  recursive: boolean,
  prefix = "",
): Promise<string[]> {
  const entries: string[] = [];
  const items = await readdir(dir, { withFileTypes: true });

  items.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  for (const item of items) {
    const fullPath = join(dir, item.name);
    const relPath = relative(workDir, fullPath);
    const displayPath = prefix + relPath;

    try {
      const s = await stat(fullPath);
      const size = item.isFile() ? ` (${formatSize(s.size)})` : "/";
      entries.push(`  ${displayPath}${size}`);
    } catch {
      entries.push(`  ${displayPath}`);
    }

    if (recursive && item.isDirectory()) {
      try {
        const sub = await listDir(fullPath, workDir, true, prefix);
        entries.push(...sub);
      } catch {
        // skip unreadable dirs
      }
    }
  }

  return entries;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
