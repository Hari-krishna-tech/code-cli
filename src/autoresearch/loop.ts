import {
  generateBranchName,
  createExperimentBranch,
  commitChanges,
  revertChanges,
  switchToBranch,
  deleteBranch,
  getChangedFiles,
  getDiffSummary,
  isRepoClean,
} from "./git.js";
import { runEvalSuite, builtinEvalSuite } from "./evaluator.js";
import { ExperimentStore } from "./store.js";
import { runAgent } from "./runner.js";
import type {
  ExperimentConfig,
  ExperimentRecord,
  MetricSnapshot,
  EvalSuite,
} from "./types.js";

const DEFAULT_CONFIG: ExperimentConfig = {
  maxIterations: 10,
  improvementPrompt:
    "Analyze the agent loop in src/agent/loop.ts and the tools in src/tools/. Find one concrete improvement that would increase the agent's success rate or reduce the number of tool calls needed. Make the change. Do not break existing functionality.",
  minScoreDelta: 0.01,
  evals: builtinEvalSuite().cases,
};

export async function runExperimentLoop(
  config: Partial<ExperimentConfig> = {},
  onIteration?: (record: ExperimentRecord) => void,
): Promise<ExperimentRecord[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const suite: EvalSuite = { name: "experiment-suite", cases: cfg.evals };
  const store = new ExperimentStore();
  const records: ExperimentRecord[] = [];

  if (!isRepoClean()) {
    console.warn("Warning: repo has uncommitted changes. Stashing them.");
    // Continue anyway — git sandboxing will branch off
  }

  // Baseline
  console.log("Measuring baseline...");
  const { snapshot: baseline } = await runEvalSuite(suite);
  console.log(
    `  Baseline: score=${baseline.evalScore} success=${baseline.successRate} tokens=${baseline.avgTokens} latency=${baseline.avgLatencyMs}ms`,
  );

  const originalBranch = createExperimentBranch(generateBranchName("baseline"));
  // baseline measured on main; create a throwaway branch so we can return clean
  switchToBranch(originalBranch);

  for (let i = 0; i < cfg.maxIterations; i++) {
    const branchName = generateBranchName("exp");
    console.log(`\nIteration ${i + 1}/${cfg.maxIterations} [${branchName}]`);

    // 1. Create experiment branch
    const returnBranch = createExperimentBranch(branchName);
    console.log(`  Branched from ${returnBranch}`);

    // 2. Ask AI to improve the system
    console.log(`  Running agent with: "${cfg.improvementPrompt.slice(0, 80)}..."`);
    const agentResult = await runAgent(cfg.improvementPrompt);

    if (agentResult.error) {
      console.log(`  Agent error: ${agentResult.error}`);
      revertChanges();
      switchToBranch(returnBranch);
      deleteBranch(branchName);

      const failRecord = createRecord(
        branchName,
        cfg.improvementPrompt,
        baseline,
        baseline, // no change
        [],
        false,
      );
      records.push(failRecord);
      store.record(failRecord);
      if (onIteration) onIteration(failRecord);
      continue;
    }

    console.log(
      `  Agent done: ${agentResult.toolCallCount} tool calls, ${agentResult.usage.total} tokens`,
    );

    // 3. Commit the agent's changes
    const committed = commitChanges(`experiment: ${cfg.improvementPrompt.slice(0, 60)}`);
    if (!committed) {
      console.log("  No changes made by agent.");
      switchToBranch(returnBranch);
      deleteBranch(branchName);

      const noChangeRecord = createRecord(
        branchName,
        cfg.improvementPrompt,
        baseline,
        baseline,
        [],
        false,
      );
      records.push(noChangeRecord);
      store.record(noChangeRecord);
      if (onIteration) onIteration(noChangeRecord);
      continue;
    }

    // 4. Run evals
    console.log("  Running evals...");
    const { snapshot: result } = await runEvalSuite(suite);
    console.log(
      `  Result: score=${result.evalScore} success=${result.successRate} tokens=${result.avgTokens} latency=${result.avgLatencyMs}ms`,
    );

    const changedFiles = getChangedFiles(returnBranch);
    const diffSummary = getDiffSummary(returnBranch);

    // 5. Compare and decide
    const improved =
      result.evalScore > baseline.evalScore + cfg.minScoreDelta;

    if (improved) {
      console.log(`  KEEP — score improved (${baseline.evalScore} → ${result.evalScore})`);
      // Update baseline for next iteration
      Object.assign(baseline, result);
    } else {
      console.log(`  REVERT — score did not improve (${baseline.evalScore} → ${result.evalScore})`);
      revertChanges();
      switchToBranch(returnBranch);
      deleteBranch(branchName);
    }

    const record = createRecord(
      branchName,
      cfg.improvementPrompt,
      baseline,
      result,
      changedFiles,
      improved,
    );
    record.diffSummary = diffSummary;

    records.push(record);
    store.record(record);
    if (onIteration) onIteration(record);

    if (!improved) {
      switchToBranch(returnBranch);
    }
    // If improved, stay on the experiment branch (it becomes the new base)
  }

  console.log(`\nDone. ${records.filter((r) => r.success).length}/${records.length} improvements kept.`);
  console.log(`Best score: ${store.bestScore()}`);
  const trend = store.trend();
  console.log(`Streak: ${trend.streak}, Improving trend: ${trend.improving}`);

  return records;
}

function createRecord(
  branch: string,
  prompt: string,
  baseline: MetricSnapshot,
  result: MetricSnapshot,
  changes: string[],
  success: boolean,
): ExperimentRecord {
  return {
    id: branch,
    timestamp: Date.now(),
    branch,
    prompt,
    baseline: { ...baseline },
    result: { ...result },
    changes,
    diffSummary: "",
    success,
  };
}
