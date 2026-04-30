#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { startREPL } from "./cli/repl.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_VERSION = JSON.parse(
  readFileSync(resolve(__dirname, "../package.json"), "utf-8"),
).version as string;

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
  code-cli — AI-powered CLI coding assistant

  Usage:
    code-cli              Start interactive REPL (default)
    code-cli --help       Show this help
    code-cli --version    Show version

  Environment:
    DEEPSEEK_API_KEY        API key for DeepSeek (default provider)

  Configuration:
    agent.config.json         Project-level config
    ~/.code-cli/config.json   User-level config
`);
    process.exit(0);
  }

  if (args.includes("--version") || args.includes("-v")) {
    console.log(`code-cli v${PKG_VERSION}`);
    process.exit(0);
  }

  await startREPL();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
