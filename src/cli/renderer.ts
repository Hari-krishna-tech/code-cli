import chalk from "chalk";

function formatCodeBlock(code: string, lang: string): string {
  const langTag = lang ? chalk.cyan(` ${lang}`) : "";
  const border = chalk.dim("▎");
  const lines = code.split("\n");
  const formatted = lines.map((l) => `${border} ${chalk.hex("#e6db74")(l)}`).join("\n");
  return `\n${chalk.dim("┌─")}${chalk.dim("─".repeat(28))}${langTag}\n${formatted}\n${chalk.dim("└─")}${chalk.dim("─".repeat(28))}\n`;
}

const TERM_WIDTH = () => Math.min(process.stdout.columns || 80, 100);

export function banner(): void {
  console.log("");
  console.log(
    chalk.bold.white("  code-cli ") + chalk.gray("— AI coding assistant")
  );
  console.log(chalk.gray(`  cwd: ${process.cwd()}`));
}

export function userPrompt(text: string): void {
  console.log("");
  // Show multi-line user input with continuation markers
  const lines = text.split("\n");
  for (const line of lines) {
    console.log(chalk.bold.hex("#d4a574")("  > ") + chalk.white(line));
  }
  console.log("");
}

export function assistantThinking(): void {
  process.stdout.write(chalk.dim("  ● ") + chalk.white("Thinking"));
}

export function assistantStreamToken(token: string): void {
  // Render code blocks (```...```) with a distinct boxed style
  const parts = token.split(/(```[\s\S]*?```)/g);
  for (const part of parts) {
    const match = part.match(/^```(\w*)\n?([\s\S]*?)```$/);
    if (match) {
      process.stdout.write(formatCodeBlock(match[2], match[1]));
    } else {
      process.stdout.write(chalk.white(part));
    }
  }
}

export function assistantDone(): void {
  console.log("");
}

export function toolCallStart(name: string, params: Record<string, unknown>): void {
  const shortParams = formatParams(params);
  console.log("");
  console.log(
    chalk.yellow(`  ⚙ ${name}`) + chalk.yellow.dim(` ${shortParams}`)
  );
}

export function toolCallResult(name: string, output: string): void {
  const lines = output.split("\n");
  const preview = lines.slice(0, 5).join("\n");
  const more = lines.length > 5 ? chalk.yellow.dim(`\n  ┊ ... and ${lines.length - 5} more lines`) : "";

  const color = output.startsWith("Error") ? chalk.red : chalk.hex("#f0c040");
  console.log(color(`  ┊ ${preview}${more}`));
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
