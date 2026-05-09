#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { startREPL } from "./cli/repl.js";
import { runAgent } from "./autoresearch/runner.js";
import { runEvalSuite, builtinEvalSuite } from "./autoresearch/evaluator.js";
import { runExperimentLoop } from "./autoresearch/loop.js";
import { getPreset, getPresets, listPresets } from "./autoresearch/presets.js";
import type { ExperimentConfig } from "./autoresearch/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_VERSION = JSON.parse(
  readFileSync(resolve(__dirname, "../package.json"), "utf-8"),
).version as string;

function printHelp(): void {
  console.log(`
code-cli — AI-powered CLI coding assistant

Usage:
  code-cli                        Start interactive REPL (default)
  code-cli --run "<prompt>"       Run a single prompt non-interactively
  code-cli --eval                 Run built-in eval suite
  code-cli --experiment           Run experiment loop (autoresearch)
  code-cli --list-presets         List available experiment presets
  code-cli --help                 Show this help
  code-cli --version              Show version

Experiment options:
  --preset <name>                   Use a named experiment preset
  --experiment-config <path>        Path to experiment config JSON
  --experiment-iterations <n>       Max iterations (default: 10)
  --experiment-prompt "<prompt>"    Improvement prompt for each iteration

Environment:
  DEEPSEEK_API_KEY                API key for DeepSeek (default provider)

Configuration:
  agent.config.json               Project-level config
  ~/.code-cli/config.json         User-level config
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  if (args.includes("--version") || args.includes("-v")) {
    console.log(`code-cli v${PKG_VERSION}`);
    process.exit(0);
  }

  // Non-interactive: run a single prompt
  const runIdx = args.indexOf("--run");
  if (runIdx !== -1) {
    const prompt = args[runIdx + 1];
    if (!prompt) {
      console.error("Error: --run requires a prompt string");
      process.exit(1);
    }
    const result = await runAgent(prompt);
    if (result.error) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }
    console.log(result.response);
    console.log(
      `\nTokens: ${result.usage.total} | Tool calls: ${result.toolCallCount} | Time: ${result.durationMs}ms`,
    );
    process.exit(0);
  }

  // Eval mode: run built-in eval suite
  if (args.includes("--eval")) {
    const suite = builtinEvalSuite();
    console.log(`Running eval suite: ${suite.name} (${suite.cases.length} cases)\n`);

    const { results, snapshot } = await runEvalSuite(suite, (result) => {
      const icon = result.passed ? "✓" : "✗";
      console.log(
        `  ${icon} ${result.case.padEnd(24)} score=${result.score} toolCalls=${result.toolCalls} tokens=${result.tokens.total} time=${result.durationMs}ms`,
      );
      if (result.errors.length > 0) {
        for (const err of result.errors) {
          console.log(`    - ${err}`);
        }
      }
    });

    console.log(`\n---`);
    console.log(`Score: ${snapshot.evalScore} | Success rate: ${snapshot.successRate}`);
    console.log(
      `Avg tokens: ${snapshot.avgTokens} | Avg latency: ${snapshot.avgLatencyMs}ms | Avg tool calls: ${snapshot.avgToolCalls}`,
    );

    const passed = results.filter((r) => r.passed).length;
    console.log(`Passed: ${passed}/${results.length}`);
    process.exit(passed === results.length ? 0 : 1);
  }

  // List presets
  if (args.includes("--list-presets")) {
    console.log("Available experiment presets:\n");
    for (const p of getPresets()) {
      console.log(`  ${p.name.padEnd(22)} ${p.description}`);
    }
    console.log(`\nUse: code-cli --experiment --preset <name>`);
    process.exit(0);
  }

  // Experiment mode: run the autoresearch loop
  if (args.includes("--experiment")) {
    const config: Partial<ExperimentConfig> = {};

    // Check for preset first (may be overridden by explicit flags)
    const presetIdx = args.indexOf("--preset");
    if (presetIdx !== -1) {
      const presetName = args[presetIdx + 1];
      if (presetName && !presetName.startsWith("-")) {
        const preset = getPreset(presetName);
        if (!preset) {
          console.error(`Unknown preset: "${presetName}". Use --list-presets to see available.`);
          process.exit(1);
        }
        Object.assign(config, preset.config);
        console.log(`Using preset: ${preset.name} — ${preset.description}\n`);
      }
    }

    const configIdx = args.indexOf("--experiment-config");
    if (configIdx !== -1) {
      const configPath = args[configIdx + 1];
      if (configPath) {
        try {
          const raw = JSON.parse(readFileSync(configPath, "utf-8"));
          Object.assign(config, raw);
        } catch (err) {
          console.error(`Error loading experiment config: ${(err as Error).message}`);
          process.exit(1);
        }
      }
    }

    const iterationsIdx = args.indexOf("--experiment-iterations");
    if (iterationsIdx !== -1) {
      const n = parseInt(args[iterationsIdx + 1], 10);
      if (!isNaN(n) && n > 0) config.maxIterations = n;
    }

    const promptIdx = args.indexOf("--experiment-prompt");
    if (promptIdx !== -1) {
      const prompt = args[promptIdx + 1];
      if (prompt) config.improvementPrompt = prompt;
    }

    console.log("=== code-cli autoresearch ===\n");
    const records = await runExperimentLoop(config, (record) => {
      const icon = record.success ? "KEPT" : "REVERT";
      console.log(`  → ${icon}: ${record.id}`);
    });

    const kept = records.filter((r) => r.success).length;
    console.log(`\nTotal: ${kept}/${records.length} improvements kept.`);
    process.exit(0);
  }

  // Default: interactive REPL
  await startREPL();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
