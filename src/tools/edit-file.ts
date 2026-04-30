import { readFile, writeFile } from "node:fs/promises";
import { type Tool, type ToolResult } from "./types.js";
import { type Config, resolvePath } from "../utils/config.js";
import { isWithinWorkingDir } from "./read-file.js";

export function createEditFileTool(config: Config): Tool {
  return {
    definition: {
      name: "edit_file",
      description:
        "Replace a specific string in a file. Finds old_string and replaces it with new_string.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The absolute or relative path to the file to edit.",
          },
          old_string: {
            type: "string",
            description: "The exact text to replace.",
          },
          new_string: {
            type: "string",
            description: "The replacement text.",
          },
        },
        required: ["path", "old_string", "new_string"],
      },
    },
    async execute(params): Promise<ToolResult> {
      const rawPath = params.path as string;
      const oldStr = params.old_string as string;
      const newStr = params.new_string as string;
      const resolved = resolvePath(config, rawPath);

      if (!isWithinWorkingDir(config.workingDirectory, resolved)) {
        return {
          success: false,
          output: "",
          error: `Access denied: path "${resolved}" is outside working directory.`,
        };
      }

      try {
        const original = await readFile(resolved, "utf-8");

        if (!original.includes(oldStr)) {
          return {
            success: false,
            output: "",
            error: `old_string not found in "${resolved}". The text must match exactly, including whitespace.`,
          };
        }

        const count = original.split(oldStr).length - 1;
        if (count > 1) {
          return {
            success: false,
            output: "",
            error: `old_string appears ${count} times in "${resolved}". Provide more surrounding context to make it unique.`,
          };
        }

        const updated = original.replace(oldStr, newStr);
        await writeFile(resolved, updated, "utf-8");

        const added = newStr.split("\n").length - oldStr.split("\n").length;
        const diffDesc =
          added > 0
            ? `+${added} lines`
            : added < 0
              ? `${added} lines`
              : "0 line change";

        return {
          success: true,
          output: `Edited ${resolved} (${diffDesc}). Replacement successful.`,
        };
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          return {
            success: false,
            output: "",
            error: `File not found: "${resolved}"`,
          };
        }
        return {
          success: false,
          output: "",
          error: `Cannot edit "${resolved}": ${(err as Error).message}`,
        };
      }
    },
  };
}
