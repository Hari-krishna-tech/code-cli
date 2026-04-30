import { exec, type ExecOptions } from "node:child_process";
import { type Tool, type ToolResult } from "./types.js";
import { type Config } from "../utils/config.js";

const RISKY_PATTERNS = [
  /\brm\s+-rf\b/,
  /\brm\s+-r\b/,
  /\brm\s+.*\*/,  // rm ... *
  /\bgit\s+push\s+--force\b/,
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+clean\b/,
  /\bdocker\s+rm\b/,
  /\bdocker\s+rmi\b/,
  /\bdocker\s+system\s+prune\b/,
  /\bDROP\s+(TABLE|DATABASE)\b/i,
  /\bDELETE\s+FROM\b/i,
  /\bshutdown\b/,
  /\breboot\b/,
  /\bchmod\s+777\b/,
  /\b>:.*\/dev\//,
  /\bcurl.*\|\s*(ba)?sh\b/,
  /\bwget.*\|\s*(ba)?sh\b/,
];

export function createRunCommandTool(config: Config): Tool {
  return {
    definition: {
      name: "run_command",
      description:
        "Execute a shell command in the terminal. Returns stdout, stderr, and exit code.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The shell command to execute.",
          },
          timeout: {
            type: "number",
            description: "Timeout in milliseconds. Default 30000.",
          },
        },
        required: ["command"],
      },
    },
    async execute(params): Promise<ToolResult> {
      const command = params.command as string;
      const timeout = (params.timeout as number) || 30000;

      if (config.requireConfirmation.riskyCommand && isRisky(command)) {
        return {
          success: false,
          output: "",
          error: `RISKY COMMAND BLOCKED: "${command}"\nThis command matches a destructive pattern. Set requireConfirmation.riskyCommand=false in config to allow, or rephrase the command.`,
        };
      }

      try {
        const result = await executeCommand(command, {
          cwd: config.workingDirectory,
          timeout,
        });

        const parts: string[] = [];
        if (result.stdout) parts.push(result.stdout.trimEnd());
        if (result.stderr) parts.push(`[stderr]\n${result.stderr.trimEnd()}`);
        if (result.exitCode !== 0)
          parts.push(`[exit code: ${result.exitCode}]`);

        return {
          success: result.exitCode === 0,
          output: parts.join("\n") || "(no output)",
        };
      } catch (err) {
        const msg = (err as Error).message;
        if (msg.includes("killed") || msg.includes("ETIMEDOUT")) {
          return {
            success: false,
            output: "",
            error: `Command timed out after ${timeout}ms: "${command}"`,
          };
        }
        return {
          success: false,
          output: "",
          error: `Command failed: ${msg}`,
        };
      }
    },
  };
}

function isRisky(command: string): boolean {
  return RISKY_PATTERNS.some((p) => p.test(command));
}

function executeCommand(
  command: string,
  options: { cwd: string; timeout: number },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const opts: ExecOptions = {
      cwd: options.cwd,
      timeout: options.timeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB
      shell: process.env.SHELL || "/bin/bash",
    };

    exec(command, opts, (error, stdout, stderr) => {
      if (error && !stdout && !stderr) {
        reject(error);
      } else {
        resolve({
          stdout: String(stdout || ""),
          stderr: String(stderr || ""),
          exitCode: error ? Number((error as NodeJS.ErrnoException).code) || 1 : 0,
        });
      }
    });
  });
}
