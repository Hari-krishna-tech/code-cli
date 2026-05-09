import { createProvider } from "../llm/provider.js";
import { createToolRegistry } from "../tools/registry.js";
import { runAgentLoop } from "../agent/loop.js";
import { Config, loadConfig } from "../utils/config.js";
import { Logger } from "../utils/logger.js";
import type { TokenUsage } from "../llm/types.js";

export interface RunResult {
  response: string;
  usage: TokenUsage;
  toolCallCount: number;
  durationMs: number;
  error?: string;
}

export async function runAgent(
  prompt: string,
  overrides?: Partial<Config>,
): Promise<RunResult> {
  const config = { ...loadConfig(), ...overrides };
  const logger = new Logger(false); // quiet — no console output
  const provider = createProvider(config);
  const registry = createToolRegistry(config);

  let toolCallCount = 0;
  const start = performance.now();

  try {
    const { response, usage } = await runAgentLoop(
      prompt,
      { provider, registry, config, logger },
      undefined, // no streaming text callback
      () => {
        toolCallCount++;
      },
      undefined, // no tool result callback
    );

    const durationMs = Math.round(performance.now() - start);

    return {
      response,
      usage,
      toolCallCount,
      durationMs,
    };
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    return {
      response: "",
      usage: { input: 0, output: 0, total: 0 },
      toolCallCount,
      durationMs,
      error: (err as Error).message,
    };
  }
}
