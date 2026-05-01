import { readFile, writeFile } from "node:fs/promises";
import { type Tool, type ToolResult, type DiffHunk } from "./types.js";
import { type Config, resolvePath } from "../utils/config.js";
import { isWithinWorkingDir } from "./read-file.js";

function computeDiff(oldStr: string, newStr: string): DiffHunk[] {
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");

  // Find common prefix
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) {
    prefix++;
  }

  // Find common suffix (after prefix)
  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix++;
  }

  // Context lines to show before/after changes
  const CONTEXT = 3;
  const ctxStart = Math.max(0, prefix - CONTEXT);
  const ctxEndOld = Math.min(oldLines.length, oldLines.length - suffix + CONTEXT);
  const ctxEndNew = Math.min(newLines.length, newLines.length - suffix + CONTEXT);

  const hunkLines: string[] = [];

  // Context before
  for (let i = ctxStart; i < prefix; i++) {
    hunkLines.push(" " + oldLines[i]);
  }

  // Removed lines
  for (let i = prefix; i < oldLines.length - suffix; i++) {
    hunkLines.push("-" + oldLines[i]);
  }

  // Added lines
  for (let i = prefix; i < newLines.length - suffix; i++) {
    hunkLines.push("+" + newLines[i]);
  }

  // Context after
  for (let i = oldLines.length - suffix; i < ctxEndOld; i++) {
    hunkLines.push(" " + oldLines[i]);
  }

  const oldCount = oldLines.length - suffix - prefix;
  const newCount = newLines.length - suffix - prefix;

  return [{
    oldStart: prefix + 1,
    oldLines: oldCount,
    newStart: prefix + 1,
    newLines: newCount,
    lines: hunkLines,
  }];
}

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

        const diff = computeDiff(oldStr, newStr);

        return {
          success: true,
          output: `Edited ${resolved} (${diffDesc}). Replacement successful.`,
          diff,
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
