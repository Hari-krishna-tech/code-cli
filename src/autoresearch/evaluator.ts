import { existsSync } from "node:fs";
import { runAgent, type RunResult } from "./runner.js";
import type { EvalCase, EvalResult, EvalSuite, MetricSnapshot } from "./types.js";

export function defineEvalSuite(name: string, cases: EvalCase[]): EvalSuite {
  return { name, cases };
}

function checkOutput(result: RunResult, expected: string[]): { passed: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const pattern of expected) {
    const found =
      result.response.includes(pattern) ||
      result.response.toLowerCase().includes(pattern.toLowerCase());
    if (!found) {
      errors.push(`Missing expected output: "${pattern}"`);
    }
  }
  return { passed: errors.length === 0, errors };
}

function checkFiles(expectedFiles: string[]): { passed: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const file of expectedFiles) {
    if (!existsSync(file)) {
      errors.push(`Missing expected file: "${file}"`);
    }
  }
  return { passed: errors.length === 0, errors };
}

export async function runEvalCase(evalCase: EvalCase): Promise<EvalResult> {
  const start = performance.now();

  const result = await runAgent(evalCase.prompt);

  const durationMs = Math.round(performance.now() - start);

  const outputCheck = checkOutput(result, evalCase.expectedOutput);
  const fileCheck = checkFiles(evalCase.expectedFiles);

  const allErrors = [...outputCheck.errors, ...fileCheck.errors];

  if (result.error) {
    allErrors.push(`Agent error: ${result.error}`);
  }

  if (result.toolCallCount > evalCase.maxToolCalls) {
    allErrors.push(
      `Too many tool calls: ${result.toolCallCount} (max ${evalCase.maxToolCalls})`,
    );
  }

  const checksPassed =
    outputCheck.passed && fileCheck.passed && !result.error && result.toolCallCount <= evalCase.maxToolCalls;

  return {
    case: evalCase.name,
    passed: checksPassed,
    score: checksPassed ? 1 : allErrors.length >= 2 ? 0 : 0.5,
    output: result.response,
    toolCalls: result.toolCallCount,
    tokens: result.usage,
    durationMs,
    errors: allErrors,
  };
}

export async function runEvalSuite(
  suite: EvalSuite,
  onProgress?: (result: EvalResult) => void,
): Promise<{ results: EvalResult[]; snapshot: MetricSnapshot }> {
  const results: EvalResult[] = [];

  for (const evalCase of suite.cases) {
    const result = await runEvalCase(evalCase);
    results.push(result);
    if (onProgress) onProgress(result);
  }

  const passed = results.filter((r) => r.passed).length;
  const snapshot = computeSnapshot(results);

  return { results, snapshot };
}

function computeSnapshot(results: EvalResult[]): MetricSnapshot {
  const count = results.length;
  if (count === 0) {
    return {
      timestamp: Date.now(),
      evalScore: 0,
      avgTokens: 0,
      avgLatencyMs: 0,
      avgToolCalls: 0,
      successRate: 0,
    };
  }

  const totalTokens = results.reduce((s, r) => s + r.tokens.total, 0);
  const totalLatency = results.reduce((s, r) => s + r.durationMs, 0);
  const totalToolCalls = results.reduce((s, r) => s + r.toolCalls, 0);
  const totalScore = results.reduce((s, r) => s + r.score, 0);
  const passed = results.filter((r) => r.passed).length;

  return {
    timestamp: Date.now(),
    evalScore: Math.round((totalScore / count) * 100) / 100,
    avgTokens: Math.round(totalTokens / count),
    avgLatencyMs: Math.round(totalLatency / count),
    avgToolCalls: Math.round((totalToolCalls / count) * 100) / 100,
    successRate: Math.round((passed / count) * 100) / 100,
  };
}

/** Built-in eval suite — project-specific tests for code-cli agent capabilities */
export function builtinEvalSuite(): EvalSuite {
  return defineEvalSuite("code-cli-core", [
    {
      name: "read-and-summarize",
      description: "Agent reads a source file and accurately summarizes its purpose",
      prompt:
        "Read src/agent/loop.ts and tell me in one sentence what the runAgentLoop function does. Be specific about the loop mechanism.",
      expectedOutput: ["tool", "turn", "provider", "message"],
      expectedFiles: [],
      maxToolCalls: 3,
      timeout: 30000,
    },
    {
      name: "search-accuracy",
      description: "Agent uses search to find all definition/usage sites of a symbol",
      prompt:
        "Find all files that import or use 'createProvider'. List each file and the line where it appears.",
      expectedOutput: [".ts", "createProvider", "provider"],
      expectedFiles: [],
      maxToolCalls: 5,
      timeout: 30000,
    },
    {
      name: "tool-selection",
      description: "Agent picks the most efficient tool for the job — search, not read all files",
      prompt:
        "What function in this codebase handles context trimming? Tell me the function name and which file it's in. Use the most efficient tool — do NOT read files one by one.",
      expectedOutput: ["trim", "context", "ContextManager"],
      expectedFiles: [],
      maxToolCalls: 2,
      timeout: 15000,
    },
    {
      name: "multi-step-chain",
      description: "Agent chains tools: list dir → read file → reason about content",
      prompt:
        "First list the src/tools/ directory. Then read the file that handles editing. Tell me what validation the edit tool performs before writing.",
      expectedOutput: ["old_string", "unique", "not found", "outside"],
      expectedFiles: [],
      maxToolCalls: 5,
      timeout: 30000,
    },
    {
      name: "error-recovery",
      description: "Agent recovers from a failed tool call instead of repeating it",
      prompt:
        "Read the file src/nonexistent-12345.ts. If it fails, explain why it failed and try a different approach to find what you need.",
      expectedOutput: ["not exist", "not found", "error", "cannot"],
      expectedFiles: [],
      maxToolCalls: 2,
      timeout: 15000,
    },
    {
      name: "codebase-reasoning",
      description: "Agent synthesizes information from multiple files to answer an architectural question",
      prompt:
        "How does a user prompt flow through the system? Trace the path from index.ts through to an LLM API call and back. Name every file involved and its role.",
      expectedOutput: ["index.ts", "repl.ts", "loop.ts", "provider", "deepseek"],
      expectedFiles: [],
      maxToolCalls: 8,
      timeout: 45000,
    },
    {
      name: "no-hallucination",
      description: "Agent does not invent functions or files that don't exist",
      prompt:
        "Does this project have a function called 'optimizePrompt'? Search for it and tell me definitively yes or no.",
      expectedOutput: ["no", "not found", "does not", "no match"],
      expectedFiles: [],
      maxToolCalls: 2,
      timeout: 15000,
    },
    {
      name: "config-awareness",
      description: "Agent understands project configuration and tool toggles",
      prompt:
        "Read src/utils/config.ts and tell me: what tools can be toggled on/off, and what happens when a tool is disabled?",
      expectedOutput: ["tool", "readFile", "writeFile", "editFile", "boolean", "true", "false"],
      expectedFiles: [],
      maxToolCalls: 3,
      timeout: 20000,
    },
  ]);
}
