import type { ExperimentConfig } from "./types.js";
import { builtinEvalSuite } from "./evaluator.js";

export interface Preset {
  name: string;
  description: string;
  config: ExperimentConfig;
}

export function getPresets(): Preset[] {
  const evals = builtinEvalSuite().cases;

  return [
    {
      name: "reduce-tokens",
      description: "Reduce average token usage by 15%+",
      config: {
        maxIterations: 10,
        minScoreDelta: 0.02,
        improvementPrompt:
          "Analyze src/agent/loop.ts and src/llm/context.ts. Find one change that reduces total token usage per turn by at least 15%. Ideas: truncate tool outputs earlier, compress system prompt, reduce duplicate file reads, cache file contents across turns. Make ONE change. Do not break existing functionality.",
        evals,
      },
    },
    {
      name: "reduce-tool-calls",
      description: "Reduce average tool calls per task by 25%+",
      config: {
        maxIterations: 10,
        minScoreDelta: 0.02,
        improvementPrompt:
          "Analyze src/agent/loop.ts and the tool definitions in src/tools/types.ts. Agents are making too many tool calls (avg 3.25 per task, but many tasks need only 1-2). Find one change that reduces unnecessary tool calls. Ideas: add a 'plan' step before acting, combine read+search into one call, improve system prompt to encourage efficient tool use. Make ONE change.",
        evals,
      },
    },
    {
      name: "reduce-latency",
      description: "Reduce average response latency by 20%+",
      config: {
        maxIterations: 10,
        minScoreDelta: 0.02,
        improvementPrompt:
          "Analyze src/agent/loop.ts and src/llm/deepseek.ts. Average latency is 13s per eval case. Find one change that reduces wall-clock time. Ideas: parallelize independent tool calls, reduce streaming overhead, add response caching, optimize context trimming loop (O(n) instead of O(n²)). Make ONE change.",
        evals,
      },
    },
    {
      name: "improve-accuracy",
      description: "Improve eval pass rate (currently 38%)",
      config: {
        maxIterations: 10,
        minScoreDelta: 0.05,
        improvementPrompt:
          "The agent currently passes only 38% of eval cases. Analyze failures: (1) tool-selection: agent uses search then reads file anyway, (2) error-recovery: agent doesn't clearly report errors, (3) codebase-reasoning: agent reads too many files (14 tool calls), (4) no-hallucination: agent doesn't give definitive 'no', (5) config-awareness: agent misses key details. Fix ONE of these. Make the change and ensure existing evals still pass.",
        evals,
      },
    },
    {
      name: "better-planning",
      description: "Improve multi-step task planning",
      config: {
        maxIterations: 10,
        minScoreDelta: 0.02,
        improvementPrompt:
          "The agent struggles with multi-step tasks (14 tool calls when 5-6 would suffice). Modify the system prompt in src/agent/loop.ts to encourage: (1) think before acting, (2) use search before read, (3) batch related operations. The SYSTEM_PROMPT constant is where to make changes. Keep it concise — agent has limited context.",
        evals,
      },
    },
    {
      name: "better-errors",
      description: "Improve error reporting clarity",
      config: {
        maxIterations: 5,
        minScoreDelta: 0.02,
        improvementPrompt:
          "When a tool fails (file not found, search no results), the agent must clearly state the failure instead of trying alternatives that also fail. Modify the system prompt in src/agent/loop.ts to instruct the agent to report errors clearly with phrases like 'File not found', 'No matches', 'Error: ...'. Make the change.",
        evals,
      },
    },
  ];
}

export function getPreset(name: string): Preset | undefined {
  return getPresets().find((p) => p.name === name);
}

export function listPresets(): string[] {
  return getPresets().map((p) => p.name);
}
