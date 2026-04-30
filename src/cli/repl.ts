import chalk from "chalk";
import { type Config, loadConfig } from "../utils/config.js";
import { Logger } from "../utils/logger.js";
import { createProvider } from "../llm/provider.js";
import { createToolRegistry } from "../tools/registry.js";
import { runAgentLoop } from "../agent/loop.js";
import * as render from "./renderer.js";

export async function startREPL(): Promise<void> {
  const config = loadConfig();
  const logger = new Logger(true);
  const provider = createProvider(config);
  const registry = createToolRegistry(config);

  render.banner();

  // Switch stdin to raw mode for character-by-character control
  const stdin = process.stdin;
  if (stdin.isTTY) {
    stdin.setRawMode(true);
  }
  stdin.resume();
  stdin.setEncoding("utf-8");

  let running = false;
  let multiLineBuffer: string[] = [];
  let inputBuffer = "";
  let skipNextLF = false;

  // Render prompt line
  const showPrompt = () => {
    render.newline();
    process.stdout.write(chalk.bold.hex("#d4a574")("  > "));
    inputBuffer = "";
  };

  const processInput = async (input: string): Promise<void> => {
    // Multi-line continuation: line ending with backslash
    if (input.endsWith("\\")) {
      multiLineBuffer.push(input.slice(0, -1));
      process.stdout.write(chalk.dim("    · "));
      return;
    }

    // Accumulate if we have buffered lines
    let fullInput: string;
    if (multiLineBuffer.length > 0) {
      multiLineBuffer.push(input);
      fullInput = multiLineBuffer.join("\n");
      multiLineBuffer = [];
    } else {
      fullInput = input;
    }

    const trimmed = fullInput.trim();
    if (!trimmed) {
      showPrompt();
      return;
    }

    // Handle slash commands
    if (trimmed.startsWith("/")) {
      await handleCommand(trimmed, config, logger);
      showPrompt();
      return;
    }

    // Echo the user's input line (styled, once)
    render.userPrompt(trimmed);
    logger.user(trimmed);

    let toolCallCount = 0;
    let startedStreaming = false;
    running = true;

    try {
      const { response, usage } = await runAgentLoop(
        trimmed,
        { provider, registry, config, logger },
        (text) => {
          if (!startedStreaming) {
            startedStreaming = true;
          }
          render.assistantStreamToken(text);
        },
        (name, params) => {
          toolCallCount++;
          render.toolCallStart(name, params);
        },
      );

      if (!startedStreaming && response) {
        process.stdout.write(response);
      }
      render.assistantDone();
      render.tokenUsage(usage);
    } catch (err) {
      render.errorMessage(err as Error);
      logger.error((err as Error).message);
    } finally {
      running = false;
    }

    showPrompt();
  };

  // Initial prompt
  showPrompt();

  // Handle raw character input
  stdin.on("data", (data: string) => {
    if (running) return;

    for (const ch of data) {
      const code = ch.charCodeAt(0);

      if (code === 3) {
        // Ctrl+C
        process.stdout.write("\n");
        render.infoMessage("Type /exit to quit.");
        showPrompt();
        continue;
      }

      if (code === 4) {
        // Ctrl+D
        console.log(chalk.gray("\n  Goodbye!"));
        if (stdin.isTTY) stdin.setRawMode(false);
        stdin.pause();
        process.exit(0);
        return;
      }

      if (code === 13 || code === 10) {
        // CR/LF — skip LF if it immediately follows CR
        if (code === 10 && skipNextLF) {
          skipNextLF = false;
          continue;
        }
        skipNextLF = code === 13;
        // Enter — userPrompt will print the input, no need to echo \n here
        const line = inputBuffer;
        inputBuffer = "";
        processInput(line);
        continue;
      }

      skipNextLF = false;

      if (code === 127 || code === 8) {
        // Backspace
        if (inputBuffer.length > 0) {
          inputBuffer = inputBuffer.slice(0, -1);
          process.stdout.write("\b \b");
        }
        continue;
      }

      // Regular printable character — echo immediately
      if (ch >= " ") {
        inputBuffer += ch;
        process.stdout.write(ch);
      }
    }
  });
}

async function handleCommand(
  cmd: string,
  config: Config,
  logger: Logger,
): Promise<void> {
  switch (cmd) {
    case "/help":
    case "/h":
      render.helpText();
      break;
    case "/clear":
      console.clear();
      render.banner();
      break;
    case "/config":
      console.log("");
      console.log(JSON.stringify(config, null, 2));
      console.log("");
      break;
    case "/exit":
    case "/quit":
    case "/q":
      console.log(chalk.gray("\n  Goodbye!"));
      process.exit(0);
    default:
      render.infoMessage(`Unknown command: ${cmd}. Type /help for available commands.`);
  }
}
