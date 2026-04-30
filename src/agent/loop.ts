import { type LLMProvider, type Message, type ToolCall, type TokenUsage } from "../llm/types.js";
import { type ToolRegistry } from "../tools/registry.js";
import { ContextManager } from "../llm/context.js";
import { type Config } from "../utils/config.js";
import { type Logger } from "../utils/logger.js";

const SYSTEM_PROMPT = `You are a CLI coding agent—an AI-powered assistant that helps with software engineering tasks.

You operate in a working directory: {WORKDIR}

## Your capabilities
- Read files with read_file
- Write files with write_file
- Edit files with edit_file (find and replace within a file)
- List directories with list_files
- Run shell commands with run_command
- Search code with search (grep-like)

## Guidelines
- Be concise. Give direct answers, not paragraphs.
- When editing files, use edit_file with exact old_string/new_string matching.
- When running commands, explain what you're about to do.
- If a tool fails, read the error and adjust—don't repeat the same call.
- Prefer editing existing files over creating new ones where appropriate.
- Use absolute paths when you know them; relative paths are resolved from the working directory.
- Default to writing no comments. Only add one when the WHY is non-obvious.
- For run_command: chain independent commands with &&, sequential with ;

You are operating in the directory: {WORKDIR}`;

export interface AgentOptions {
  provider: LLMProvider;
  registry: ToolRegistry;
  config: Config;
  logger: Logger;
}

const MAX_TURNS = 25;

export async function runAgentLoop(
  userPrompt: string,
  options: AgentOptions,
  onText?: (text: string) => void,
  onToolCall?: (name: string, params: Record<string, unknown>) => void,
): Promise<{ response: string; usage: TokenUsage }> {
  const { provider, registry, config, logger } = options;

  const systemPrompt = SYSTEM_PROMPT.replace(/\{WORKDIR\}/g, config.workingDirectory);
  const context = new ContextManager(config.maxContextTokens);

  const messages: Message[] = [
    { role: "system", content: systemPrompt },
  ];

  // Add conversation history from recent logs
  for (const entry of logger.getEntries()) {
    switch (entry.type) {
      case "user":
        messages.push({ role: "user", content: entry.content });
        break;
      case "assistant":
        messages.push({ role: "assistant", content: entry.content });
        break;
    }
  }

  // Add current user prompt (avoid duplicate if last entry was user)
  const lastMsg = messages[messages.length - 1];
  if (!lastMsg || lastMsg.role !== "user" || lastMsg.content !== userPrompt) {
    messages.push({ role: "user", content: userPrompt });
  }

  let finalResponse = "";
  const aggregateUsage: TokenUsage = { input: 0, output: 0, total: 0 };

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const trimmed = context.trim(messages);
    const tools = registry.getDefinitions();

    const response = await provider.chat(trimmed, tools, (chunk) => {
      if (chunk.content && onText) {
        onText(chunk.content);
      }
    });

    // Aggregate usage from each turn
    if (response.usage) {
      aggregateUsage.input += response.usage.input;
      aggregateUsage.output += response.usage.output;
      aggregateUsage.total += response.usage.total;
    }

    // Handle tool calls
    if (response.toolCalls.length > 0) {
      const assistantMsg: Message = {
        role: "assistant",
        content: response.content || "",
        tool_calls: response.toolCalls,
      };
      messages.push(assistantMsg);
      if (response.content) {
        logger.assistant(response.content);
      }

      for (const tc of response.toolCalls) {
        const params = parseToolArgs(tc);
        logger.tool(tc.function.name, params);

        if (onToolCall) onToolCall(tc.function.name, params);

        const result = await registry.execute(tc.function.name, params);
        logger.tool(tc.function.name, params, result.output);

        messages.push({
          role: "tool",
          content: result.success
            ? result.output
            : `Error: ${result.error}`,
          tool_call_id: tc.id,
          name: tc.function.name,
        });
      }
      continue; // another turn to process tool results
    }

    // No tool calls — we're done
    if (response.content) {
      finalResponse = response.content;
      logger.assistant(response.content);
      messages.push({ role: "assistant", content: response.content });
    }
    break;
  }

  return { response: finalResponse, usage: aggregateUsage };
}

function parseToolArgs(tc: ToolCall): Record<string, unknown> {
  try {
    return JSON.parse(tc.function.arguments);
  } catch {
    return { raw: tc.function.arguments };
  }
}
