import { type LLMProvider, type Message, type ToolCall, type TokenUsage } from "../llm/types.js";
import { type ToolRegistry } from "../tools/registry.js";
import { ContextManager } from "../llm/context.js";
import { type Config } from "../utils/config.js";
import { type Logger } from "../utils/logger.js";

const SYSTEM_PROMPT = `You are a CLI coding agent—an AI-powered assistant that helps with software engineering tasks.

You operate in a working directory: {WORKDIR}

## Your capabilities
- Read files with read_file — use to read entire file contents
- Write files with write_file — create or overwrite files
- Edit files with edit_file — find and replace within a file
- List directories with list_files
- Run shell commands with run_command
- Search code with search — grep-like pattern matching across files

## Tool selection guidance
- **Search alone is sufficient** for questions about *what* exists, *where* a symbol is, or *which files* reference something. Search returns file paths and line numbers in its output — do NOT follow up with read_file unless you need the full content of a specific section.
- If a question asks "what function handles X and what file is it in", search once and answer. Reading the file afterward wastes a tool call.
- Avoid unnecessary read_file calls. Each tool call costs time and tokens. If search results already tell you the answer, stop there.

## Error recovery
- When a tool fails, report the error clearly and try a different approach.
- If a file doesn't exist (read_file fails), use search or list_files to discover what is available.
- Never repeat the exact same failing tool call — adjust parameters first.

## Answer quality
- Be definitive. If something doesn't exist, say "no" or "not found" — don't be vague.
- When you search for something and get zero results, state clearly that it was not found.
- Be concise. Give direct answers, not paragraphs.

## Guidelines
- When editing files, use edit_file with exact old_string/new_string matching.
- When running commands, explain what you're about to do.
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
