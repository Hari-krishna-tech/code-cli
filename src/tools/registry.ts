import { type Tool, type ToolResult } from "./types.js";
import { type Config } from "../utils/config.js";

import { createReadFileTool } from "./read-file.js";
import { createWriteFileTool } from "./write-file.js";
import { createEditFileTool } from "./edit-file.js";
import { createListFilesTool } from "./list-files.js";
import { createRunCommandTool } from "./run-command.js";
import { createSearchTool } from "./search.js";

export interface ToolRegistry {
  get(name: string): Tool | undefined;
  list(): Tool[];
  execute(
    name: string,
    params: Record<string, unknown>,
  ): Promise<ToolResult>;
  getDefinitions(): Array<{
    type: "function";
    function: Tool["definition"];
  }>;
}

export function createToolRegistry(config: Config): ToolRegistry {
  const tools = new Map<string, Tool>();

  function register(tool: Tool): void {
    tools.set(tool.definition.name, tool);
  }

  if (config.tools.readFile) register(createReadFileTool(config));
  if (config.tools.writeFile) register(createWriteFileTool(config));
  if (config.tools.editFile) register(createEditFileTool(config));
  if (config.tools.listFiles) register(createListFilesTool(config));
  if (config.tools.runCommand) register(createRunCommandTool(config));
  if (config.tools.search) register(createSearchTool(config));

  return {
    get(name: string): Tool | undefined {
      return tools.get(name);
    },

    list(): Tool[] {
      return Array.from(tools.values());
    },

    async execute(
      name: string,
      params: Record<string, unknown>,
    ): Promise<ToolResult> {
      const tool = tools.get(name);
      if (!tool) {
        return {
          success: false,
          output: "",
          error: `Unknown tool: "${name}". Available: ${Array.from(tools.keys()).join(", ")}`,
        };
      }
      return tool.execute(params);
    },

    getDefinitions() {
      return Array.from(tools.values()).map((t) => ({
        type: "function" as const,
        function: t.definition,
      }));
    },
  };
}
