import type { ToolDefinition } from "../tools/types.js";

export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
  name?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

export interface LLMResponse {
  content: string | null;
  toolCalls: ToolCall[];
  finishReason: "stop" | "tool_calls" | "length" | "error";
  usage?: TokenUsage;
}

export interface StreamChunk {
  content?: string;
  toolCall?: ToolCall;
  finishReason?: string;
}

export interface LLMProvider {
  name: string;
  chat(
    messages: Message[],
    tools: Array<{ type: "function"; function: ToolDefinition }>,
    onChunk?: (chunk: StreamChunk) => void,
  ): Promise<LLMResponse>;
}
