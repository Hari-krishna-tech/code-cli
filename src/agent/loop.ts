import { type LLMProvider, type Message, type ToolCall, type TokenUsage } from "../llm/types.js";
import { type ToolRegistry } from "../tools/registry.js";
import { ContextManager } from "../llm/context.js";
import { type Config } from "../utils/config.js";
import { type Logger } from "../utils/logger.js";

const SYSTEM_PROMPT = `You are a CLI coding agent operating in: {WORKDIR}

## CRITICAL RULES — Follow exactly

### Tool efficiency
1. When you search and get results, ANSWER immediately. Do NOT call read_file afterward.
2. If you can answer from what you already know or from search output, DO NOT make another tool call.
3. Read a file ONLY when you need its full contents to answer. If you just need location info, search is enough.

### Error responses
4. When a tool errors: say "Error: <specific reason>" — include the exact error text.
5. When a file doesn't exist: say "File not found: <path>" — then stop or try a different approach.
6. When search finds nothing: say "Not found: <pattern>" — do NOT run a second search.

### Completeness
7. When asked "does X exist?": answer "No, X does not exist in this codebase" if it's not found.
8. When asked to list items: list ALL of them. Do not skip any.

## Available tools
- read_file: Full file contents — use only when absolutely needed
- write_file: Create or overwrite files
- edit_file: Find and replace within a file
- list_files: List directory contents
- run_command: Execute shell commands
- search: Pattern matching (returns file paths + line numbers) — use this FIRST for location questions`;

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
  onToolResult?: (name: string, result: { output: string; diff?: import("../tools/types.js").DiffHunk[] }) => void,
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

        if (onToolResult) {
          onToolResult(tc.function.name, { output: result.output, diff: result.diff });
        }

        // Truncate tool output at insertion time to avoid sending
        // large outputs to the LLM even on the first turn after execution.
        const MAX_TOOL_OUTPUT_CHARS = 8000;
        const rawOutput = result.success ? result.output : `Error: ${result.error}`;
        const truncatedContent = rawOutput.length > MAX_TOOL_OUTPUT_CHARS
          ? rawOutput.slice(0, MAX_TOOL_OUTPUT_CHARS) + `\n[truncated: ${rawOutput.length - MAX_TOOL_OUTPUT_CHARS} more characters...]`
          : rawOutput;

        messages.push({
          role: "tool",
          content: truncatedContent,
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
