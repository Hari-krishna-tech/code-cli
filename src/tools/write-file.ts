import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { type Tool, type ToolResult } from "./types.js";
import { type Config, resolvePath } from "../utils/config.js";
import { isWithinWorkingDir } from "./read-file.js";

export function createWriteFileTool(config: Config): Tool {
  return {
    definition: {
      name: "write_file",
      description:
        "Write content to a file. Overwrites the file if it exists, creates it if it doesn't.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The absolute or relative path to the file to write.",
          },
          content: {
            type: "string",
            description: "The content to write to the file.",
          },
        },
        required: ["path", "content"],
      },
    },
    async execute(params): Promise<ToolResult> {
      const rawPath = params.path as string;
      const content = params.content as string;
      const resolved = resolvePath(config, rawPath);

      if (!isWithinWorkingDir(config.workingDirectory, resolved)) {
        return {
          success: false,
          output: "",
          error: `Access denied: path "${resolved}" is outside working directory.`,
        };
      }

      try {
        await mkdir(dirname(resolved), { recursive: true });
        await writeFile(resolved, content, "utf-8");
        const lines = content.split("\n").length;
        return {
          success: true,
          output: `Wrote ${content.length} bytes (${lines} lines) to ${resolved}`,
        };
      } catch (err) {
        return {
          success: false,
          output: "",
          error: `Cannot write to "${resolved}": ${(err as Error).message}`,
        };
      }
    },
  };
}
