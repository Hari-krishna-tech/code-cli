import chalk from "chalk";
import { type DiffHunk } from "../tools/types.js";

function formatCodeBlock(code: string, lang: string): string {
  const langTag = lang ? chalk.cyan(` ${lang}`) : "";
  const border = chalk.dim("▎");
  const lines = code.split("\n");
  const formatted = lines.map((l) => `${border} ${chalk.hex("#e6db74")(l)}`).join("\n");
  return `\n${chalk.dim("┌─")}${chalk.dim("─".repeat(28))}${langTag}\n${formatted}\n${chalk.dim("└─")}${chalk.dim("─".repeat(28))}\n`;
}

const TERM_WIDTH = () => Math.min(process.stdout.columns || 80, 100);
const BOX_W = 60;

function visibleLen(s: string): number {
  // Strip ANSI escape sequences to get visible length
  return s.replace(/\x1b\[[0-9;]*m/g, "").length;
}

function padRight(s: string, width: number): string {
  const len = visibleLen(s);
  return len >= width ? s : s + " ".repeat(width - len);
}

export function welcome(): void {
  const version = "v1.0.0";
  const boxW = Math.min(TERM_WIDTH() - 2, BOX_W);
  const inner = boxW - 2;

  const left = chalk.hex("#c9d1d9")("  │");
  const right = chalk.hex("#c9d1d9")("│");
  const draw = (s: string) => console.log(left + padRight(s, inner) + right);

  console.log("");
  console.log(chalk.hex("#c9d1d9")(`  ╭${"─".repeat(boxW - 2)}╮`));
  draw(chalk.bold.hex("#d4a574")(" ✦ code-cli ") + chalk.white(version));
  draw("");
  draw(chalk.dim("  AI coding assistant — ask me to read,"));
  draw(chalk.dim("  edit, search, or run anything in this repo."));
  draw("");
  draw(chalk.bold.white("  Tips:"));
  draw(`  ${chalk.cyan("/help")}       Show available commands`);
  draw(`  ${chalk.cyan("/clear")}      Clear conversation history`);
  draw(`  ${chalk.cyan("Ctrl+C")}      Interrupt current operation`);
  draw(`  ${chalk.cyan("Ctrl+D")}      Exit code-cli`);
  draw(`  ${chalk.cyan("\\")}            Continue on next line (multi-line)`);
  draw("");
  const cwd = process.cwd();
  const maxCwd = inner - 7;
  const cwdDisplay = cwd.length > maxCwd ? "..." + cwd.slice(cwd.length - maxCwd + 3) : cwd;
  draw(chalk.dim(`  cwd: ${cwdDisplay}`));
  draw("");
  draw(chalk.dim("  Type a question or task to get started."));
  console.log(chalk.hex("#c9d1d9")(`  ╰${"─".repeat(boxW - 2)}╯`));
  console.log("");
}

export function userPrompt(text: string): void {
  console.log("");
  const lines = text.split("\n");
  for (const line of lines) {
    console.log(chalk.bold.hex("#d4a574")("  > ") + chalk.white(line));
  }
  console.log("");
}

export function assistantThinking(): void {
  process.stdout.write(chalk.dim("  ● ") + chalk.white("Thinking"));
}

let _atLineStart = true;

export function assistantStreamToken(token: string): void {
  const parts = token.split(/(```[\s\S]*?```)/g);
  for (const part of parts) {
    const match = part.match(/^```(\w*)\n?([\s\S]*?)```$/);
    if (match) {
      process.stdout.write(formatCodeBlock(match[2], match[1]));
      _atLineStart = false;
    } else {
      const padded = part.replace(/\n/g, "\n  ");
      const prefix = _atLineStart ? "  " : "";
      _atLineStart = part.endsWith("\n");
      process.stdout.write(prefix + chalk.white(padded));
    }
  }
}

export function assistantDone(): void {
  console.log("");
}

export function toolCallStart(name: string, params: Record<string, unknown>): void {
  const shortParams = formatParams(params);
  console.log("");
  // Show the file path more prominently for edit_file
  if (name === "edit_file" && params.path) {
    const pathStr = typeof params.path === "string" ? params.path : String(params.path);
    console.log(
      chalk.yellow(`  ⚙ ${name} `) + chalk.dim(pathStr),
    );
  } else {
    console.log(
      chalk.yellow(`  ⚙ ${name}`) + chalk.yellow.dim(` ${shortParams}`),
    );
  }
}

export function toolCallResult(name: string, result: { output: string; diff?: DiffHunk[] }): void {
  if (name === "edit_file" && result.diff) {
    renderDiff(result.diff);
    return;
  }

  const output = result.output;
  const lines = output.split("\n");
  const preview = lines.slice(0, 5).join("\n");
  const more = lines.length > 5 ? chalk.yellow.dim(`\n  ┊ ... and ${lines.length - 5} more lines`) : "";

  const color = output.startsWith("Error") ? chalk.red : chalk.hex("#f0c040");
  console.log(color(`  ┊ ${preview}${more}`));
}

function renderDiff(hunks: DiffHunk[]): void {
  for (const hunk of hunks) {
    // Hunk header like GitHub: @@ -1,3 +1,4 @@
    const header =
      `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`;
    console.log(chalk.hex("#77bdfb")(`  ${header}`));

    for (const line of hunk.lines) {
      const prefix = line[0];
      const content = line.slice(1);
      if (prefix === "+") {
        console.log(chalk.green(`  + ${content}`));
      } else if (prefix === "-") {
        console.log(chalk.red(`  - ${content}`));
      } else {
        console.log(chalk.dim(`    ${content}`));
      }
    }
  }
  console.log("");
}

export function errorMessage(err: Error): void {
  console.log("");
  console.log(chalk.red(`  ✖ Error: ${err.message}`));
}

export function infoMessage(msg: string): void {
  console.log(chalk.gray(`  ℹ ${msg}`));
}

export function inputSeparator(): void {
  process.stdout.write("\n" + chalk.dim("─".repeat(TERM_WIDTH())) + "\n\n");
}

export function prompt(): void {
  inputSeparator();
  process.stdout.write(chalk.bold.hex("#d4a574")("  > "));
}

export function newline(): void {
  console.log("");
}

function formatParams(params: Record<string, unknown>): string {
  const entries = Object.entries(params);
  if (entries.length === 0) return "";

  const parts = entries.map(([k, v]) => {
    const val = typeof v === "string" ? (v.length > 40 ? v.slice(0, 40) + "..." : v) : JSON.stringify(v);
    return `${k}=${val}`;
  });

  return `(${parts.join(", ")})`;
}

export function tokenUsage(usage: { input: number; output: number; total: number }): void {
  console.log("");
  console.log(
    chalk.dim(`  Tokens — input: ${chalk.white(String(usage.input))}, output: ${chalk.white(String(usage.output))}, total: ${chalk.white(String(usage.total))}`),
  );
}

export function helpText(): void {
  console.log("");
  console.log(chalk.bold("  Commands:"));
  console.log(chalk.gray("  /help          Show this help"));
  console.log(chalk.gray("  /clear         Clear conversation history"));
  console.log(chalk.gray("  /config        Show current configuration"));
  console.log(chalk.gray("  /exit, /quit   Exit code-cli"));
  console.log(chalk.gray("  Ctrl+C         Interrupt / exit"));
  console.log("");
  console.log(chalk.bold("  Multi-line input:"));
  console.log(chalk.gray("  End a line with \\ to continue on the next line"));
  console.log("");
}
