import { readFile } from "node:fs/promises";
import { type Tool, type ToolResult } from "./types.js";
import { type Config, resolvePath } from "../utils/config.js";

export function createReadFileTool(config: Config): Tool {
  return {
    definition: {
      name: "read_file",
      description:
        "Read the contents of a file. Returns the file content as a string. IMPORTANT: Only use when you actually need the full file content. If you just need to know WHAT exists or WHERE a symbol is, use search instead — it's faster and uses fewer tool calls.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The absolute or relative path to the file to read.",
          },
        },
        required: ["path"],
      },
    },
    async execute(params): Promise<ToolResult> {
      const rawPath = params.path as string;
      const resolved = resolvePath(config, rawPath);

      if (!isWithinWorkingDir(config.workingDirectory, resolved)) {
        if (config.requireConfirmation.outsideWorkingDir) {
          return {
            success: false,
            output: "",
            error: `Access denied: path "${resolved}" is outside working directory "${config.workingDirectory}". Use absolute path within working directory.`,
          };
        }
      }

      try {
        const content = await readFile(resolved, "utf-8");
        const lines = content.split("\n");
        const numbered = lines
          .map((line, i) => `${String(i + 1).padStart(6, " ")}\t${line}`)
          .join("\n");
        const header = `File: ${resolved} (${lines.length} lines)\n${"-".repeat(60)}\n`;
        return { success: true, output: header + numbered };
      } catch (err) {
        return {
          success: false,
          output: "",
          error: `Cannot read "${resolved}": ${(err as Error).message}`,
        };
      }
    },
  };
}

export function isWithinWorkingDir(workingDir: string, target: string): boolean {
  const wd = workingDir.endsWith("/") ? workingDir : workingDir + "/";
  const t = target.endsWith("/") ? target : target + "/";
  return t.startsWith(wd) || target === workingDir;
}
