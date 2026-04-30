export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface Tool {
  definition: ToolDefinition;
  execute(params: Record<string, unknown>): Promise<ToolResult>;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "read_file",
    description:
      "Read the contents of a file. Returns the file content as a string.",
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
  {
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
  {
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
  {
    name: "list_files",
    description: "List files and directories in a given directory.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The directory path to list. Defaults to current directory.",
        },
        recursive: {
          type: "boolean",
          description: "Whether to list recursively. Default false.",
        },
      },
      required: [],
    },
  },
  {
    name: "run_command",
    description:
      "Execute a shell command in the terminal. Returns stdout, stderr, and exit code.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute.",
        },
        timeout: {
          type: "number",
          description: "Timeout in milliseconds. Default 30000.",
        },
      },
      required: ["command"],
    },
  },
  {
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
          description: "Directory to search in. Defaults to working directory.",
        },
        fileTypes: {
          type: "string",
          description: "Comma-separated file extensions to filter (e.g., '.ts,.js,.json').",
        },
      },
      required: ["pattern"],
    },
  },
];
