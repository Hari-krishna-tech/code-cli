import { type Config } from "./config.js";

interface LogEntry {
  type: "user" | "assistant" | "tool" | "system" | "error" | "thinking";
  content: string;
  timestamp: number;
}

const MAX_LOG_ENTRIES = 500;

export class Logger {
  private entries: LogEntry[] = [];
  private verbose: boolean;

  constructor(verbose = true) {
    this.verbose = verbose;
  }

  user(message: string): void {
    this.log("user", message);
  }

  assistant(message: string): void {
    this.log("assistant", message);
  }

  tool(toolName: string, input: unknown, output?: string): void {
    const msg = output
      ? `${toolName}(${this.formatInput(input)}) → ${this.truncate(output)}`
      : `${toolName}(${this.formatInput(input)})`;
    this.log("tool", msg);
  }

  thinking(message: string): void {
    this.log("thinking", message);
  }

  system(message: string): void {
    this.log("system", message);
  }

  error(message: string): void {
    this.log("error", message);
  }

  getEntries(): ReadonlyArray<LogEntry> {
    return this.entries;
  }

  private log(type: LogEntry["type"], content: string): void {
    if (!this.verbose && type === "thinking") return;
    this.entries.push({ type, content, timestamp: Date.now() });
    if (this.entries.length > MAX_LOG_ENTRIES) {
      this.entries = this.entries.slice(-MAX_LOG_ENTRIES);
    }
  }

  private formatInput(input: unknown): string {
    if (typeof input === "string") return this.truncate(input, 80);
    try {
      return this.truncate(JSON.stringify(input), 80);
    } catch {
      return "[unserializable]";
    }
  }

  private truncate(s: string, maxLen = 200): string {
    return s.length > maxLen ? s.slice(0, maxLen) + "..." : s;
  }
}

export function estimateTokens(text: string): number {
  // rough: 1 token ≈ 4 chars for English
  return Math.ceil(text.length / 4);
}
