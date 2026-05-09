import { type LLMProvider, type Message, type LLMResponse, type StreamChunk } from "./types.js";
import { type ToolDefinition } from "../tools/types.js";
import { type Config } from "../utils/config.js";

const DEEPSEEK_SYSTEM_CARD = `You are a CLI coding agent. You help users with software engineering tasks.

Key rules:
- After search returns results, answer immediately — do NOT call read_file.
- If a tool errors, report the exact error and stop or pivot.
- If search finds nothing, say "Not found" — do not retry.
- Say "No" definitively when something does not exist.
- List ALL items when asked — do not skip any.
- Minimize tool calls: answer as soon as you have enough information.`;

export class DeepSeekProvider implements LLMProvider {
  name = "deepseek";
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(config: Config) {
    const envVar = config.apiKeyEnvVar.deepseek;
    this.apiKey = process.env[envVar] || "";
    if (!this.apiKey) {
      console.warn(`Warning: ${envVar} not set. DeepSeek API calls will fail.`);
    }
    this.baseUrl = config.deepseekBaseUrl;
    this.model = config.model;
  }

  async chat(
    messages: Message[],
    tools: Array<{ type: "function"; function: ToolDefinition }>,
    onChunk?: (chunk: StreamChunk) => void,
  ): Promise<LLMResponse> {
    // Always prepend system message if not present
    if (!messages.some((m) => m.role === "system")) {
      messages = [
        { role: "system", content: DEEPSEEK_SYSTEM_CARD },
        ...messages,
      ];
    }

    const body = {
      model: this.model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      stream: !!onChunk,
    };

    // For non-streaming (simulated tool calling), use a simpler path
    if (!onChunk) {
      return this.nonStreamingChat(body);
    }

    return this.streamingChat(body, onChunk);
  }

  private async nonStreamingChat(body: unknown): Promise<LLMResponse> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ ...(body as Record<string, unknown>), stream: false }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`DeepSeek API error ${response.status}: ${err}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const choice = (data.choices as Array<Record<string, unknown>>)?.[0];
    const message = choice?.message as Record<string, unknown> | undefined;

    const toolCalls = this.extractToolCalls(message);
    const content = (message?.content as string) || null;

    const usageRaw = data.usage as Record<string, unknown> | undefined;
    const usage = usageRaw
      ? {
          input: (usageRaw.prompt_tokens as number) || 0,
          output: (usageRaw.completion_tokens as number) || 0,
          total: (usageRaw.total_tokens as number) || 0,
        }
      : undefined;

    return {
      content,
      toolCalls,
      finishReason: toolCalls.length > 0 ? "tool_calls" : "stop",
      usage,
    };
  }

  private async streamingChat(
    body: unknown,
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<LLMResponse> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        ...(body as Record<string, unknown>),
        stream: true,
        stream_options: { include_usage: true },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`DeepSeek API error ${response.status}: ${err}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let content = "";
    const toolCalls: Map<
      number,
      { id: string; name: string; arguments: string }
    > = new Map();
    let finishReason = "stop";
    let usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      const lines = text.split("\n").filter((l) => l.startsWith("data: "));

      for (const line of lines) {
        const json = line.slice(6).trim();
        if (json === "[DONE]") continue;

        try {
          const parsed = JSON.parse(json);

          // Capture usage from stream (last chunk with usage data)
          if (parsed.usage) {
            usage = parsed.usage;
          }

          const choice = parsed.choices?.[0];
          if (!choice) continue;

          const delta = choice.delta;
          if (!delta) continue;

          if (delta.content) {
            content += delta.content;
            onChunk({ content: delta.content });
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index;
              if (!toolCalls.has(idx)) {
                toolCalls.set(idx, {
                  id: tc.id || `call_${idx}`,
                  name: tc.function?.name || "",
                  arguments: "",
                });
              }

              const existing = toolCalls.get(idx)!;
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.name = tc.function.name;
              if (tc.function?.arguments)
                existing.arguments += tc.function.arguments;
            }
          }

          if (choice.finish_reason) {
            finishReason = choice.finish_reason;
          }
        } catch {
          // ignore parse errors for partial chunks
        }
      }
    }

    const parsedToolCalls = Array.from(toolCalls.values()).map((tc) => ({
      id: tc.id,
      type: "function" as const,
      function: {
        name: tc.name,
        arguments: tc.arguments,
      },
    }));

    const finalUsage = usage
      ? {
          input: usage.prompt_tokens || 0,
          output: usage.completion_tokens || 0,
          total: usage.total_tokens || 0,
        }
      : undefined;

    return {
      content: content || null,
      toolCalls: parsedToolCalls,
      finishReason:
        parsedToolCalls.length > 0
          ? "tool_calls"
          : (finishReason as LLMResponse["finishReason"]),
      usage: finalUsage,
    };
  }

  private extractToolCalls(
    message: Record<string, unknown> | undefined,
  ): NonNullable<LLMResponse["toolCalls"]> {
    if (!message) return [];
    const raw = message.tool_calls;
    if (!Array.isArray(raw)) return [];

    return raw.map((tc: Record<string, unknown>) => ({
      id: tc.id as string,
      type: "function" as const,
      function: {
        name: (tc.function as Record<string, unknown>)?.name as string,
        arguments:
          (tc.function as Record<string, unknown>)?.arguments as string,
      },
    }));
  }
}
