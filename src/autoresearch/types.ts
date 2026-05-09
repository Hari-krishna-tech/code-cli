import type { TokenUsage } from "../llm/types.js";
import type { DiffHunk } from "../tools/types.js";

export interface EvalCase {
  name: string;
  description: string;
  /** Prompt sent to the agent */
  prompt: string;
  /** Expected patterns in the agent's response or tool output */
  expectedOutput: string[];
  /** Files that should exist after the eval */
  expectedFiles: string[];
  /** Max allowed tool calls (cost proxy) */
  maxToolCalls: number;
  /** Timeout in ms */
  timeout: number;
}

export interface EvalResult {
  case: string;
  passed: boolean;
  score: number; // 0..1
  output: string;
  toolCalls: number;
  tokens: TokenUsage;
  durationMs: number;
  errors: string[];
}

export interface EvalSuite {
  name: string;
  cases: EvalCase[];
}

export interface MetricSnapshot {
  timestamp: number;
  evalScore: number;
  avgTokens: number;
  avgLatencyMs: number;
  avgToolCalls: number;
  successRate: number;
}

export interface ExperimentRecord {
  id: string;
  timestamp: number;
  branch: string;
  prompt: string;
  baseline: MetricSnapshot;
  result: MetricSnapshot;
  changes: string[]; // files changed
  diffSummary: string;
  success: boolean; // kept or reverted
}

export interface ExperimentConfig {
  maxIterations: number;
  improvementPrompt: string;
  minScoreDelta: number; // minimum improvement to keep
  evals: EvalCase[];
}
