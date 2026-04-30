import * as readline from "node:readline";
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

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "",
    terminal: true,
  });

  let running = false;

  const processInput = async (input: string): Promise<void> => {
    const trimmed = input.trim();
    if (!trimmed) {
      render.prompt();
      return;
    }

    // Handle slash commands
    if (trimmed.startsWith("/")) {
      await handleCommand(trimmed, config, logger, rl);
      render.prompt();
      return;
    }

    running = true;
    render.userPrompt(trimmed);
    logger.user(trimmed);

    let toolCallCount = 0;
    let startedStreaming = false;

    try {
      const { response, usage } = await runAgentLoop(
        trimmed,
        { provider, registry, config, logger },
        (text) => {
          if (!startedStreaming) {
            render.assistantThinking();
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
        render.assistantThinking();
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

    render.prompt();
  };

  // Initial prompt
  render.prompt();

  rl.on("line", (line) => {
    if (!running) {
      processInput(line);
    }
  });

  rl.on("close", () => {
    console.log("");
    process.exit(0);
  });

  // Handle Ctrl+C gracefully
  process.on("SIGINT", () => {
    if (running) {
      running = false;
      process.stdout.write("\n");
      render.infoMessage("Interrupted. Type /exit to quit.");
      render.prompt();
    } else {
      console.log("");
      process.exit(0);
    }
  });
}

async function handleCommand(
  cmd: string,
  config: Config,
  logger: Logger,
  rl: readline.Interface,
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
      rl.close();
      process.exit(0);
    default:
      render.infoMessage(`Unknown command: ${cmd}. Type /help for available commands.`);
  }
}
