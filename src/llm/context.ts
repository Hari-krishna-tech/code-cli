import { type Message } from "./types.js";
import { estimateTokens } from "../utils/logger.js";

const RESERVE_FOR_RESPONSE = 4000;
const SYSTEM_PROMPT_OVERHEAD = 2000;

export class ContextManager {
  private maxTokens: number;

  constructor(maxTokens: number) {
    this.maxTokens = maxTokens;
  }

  trim(messages: Message[]): Message[] {
    const systemMsg = messages.find((m) => m.role === "system");
    const nonSystem = messages.filter((m) => m.role !== "system");

    const systemTokens = systemMsg
      ? estimateTokens(systemMsg.content) + SYSTEM_PROMPT_OVERHEAD
      : 0;
    const availableTokens = this.maxTokens - systemTokens - RESERVE_FOR_RESPONSE;

    // Keep trimming from oldest non-system messages until we fit
    let totalTokens = 0;
    const kept: Message[] = [];

    // Always keep the last user message
    for (let i = nonSystem.length - 1; i >= 0; i--) {
      const msg = nonSystem[i];
      const msgTokens = estimateTokens(msg.content);

      // For tool results (which can be large), cap their content
      if (msg.role === "tool" && msgTokens > 4000) {
        const truncated = { ...msg, content: this.truncateToolOutput(msg.content, 2000) };
        const newTokens = estimateTokens(truncated.content);
        if (totalTokens + newTokens > availableTokens && kept.length > 0) {
          break;
        }
        kept.unshift(truncated);
        totalTokens += newTokens;
        continue;
      }

      if (totalTokens + msgTokens > availableTokens && kept.length > 0) {
        break;
      }

      kept.unshift(msg);
      totalTokens += msgTokens;
    }

    if (systemMsg) kept.unshift(systemMsg);
    return kept;
  }

  private truncateToolOutput(content: string, maxTokens: number): string {
    const lines = content.split("\n");
    const maxLen = maxTokens * 4; // rough char estimate
    if (content.length <= maxLen) return content;

    // Keep header lines + first N content lines
    const headerLines: string[] = [];
    let i = 0;
    while (i < lines.length && (lines[i].startsWith("File:") || lines[i].startsWith("Directory:") || lines[i].startsWith("Found") || lines[i].startsWith("-") || lines[i].trim() === "")) {
      headerLines.push(lines[i]);
      i++;
    }

    let result = headerLines.join("\n") + "\n";
    let chars = result.length;
    while (i < lines.length && chars < maxLen) {
      result += lines[i] + "\n";
      chars += lines[i].length + 1;
      i++;
    }

    result += `\n[truncated: ${lines.length - i} more lines...]`;
    return result;
  }
}
