import { z } from "zod";
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";

export const ConfigSchema = z.object({
  model: z.string().default("deepseek-chat"),
  provider: z.enum(["deepseek", "openai", "anthropic"]).default("deepseek"),
  workingDirectory: z.string().default(process.cwd()),
  maxContextTokens: z.number().default(128_000),
  tools: z.object({
    readFile: z.boolean().default(true),
    writeFile: z.boolean().default(true),
    editFile: z.boolean().default(true),
    listFiles: z.boolean().default(true),
    runCommand: z.boolean().default(true),
    search: z.boolean().default(true),
  }),
  requireConfirmation: z.object({
    delete: z.boolean().default(true),
    riskyCommand: z.boolean().default(true),
    outsideWorkingDir: z.boolean().default(true),
  }),
  apiKeyEnvVar: z.record(z.string()).default({
    deepseek: "DEEPSEEK_API_KEY",
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
  }),
  deepseekBaseUrl: z.string().default("https://api.deepseek.com"),
});

export type Config = z.infer<typeof ConfigSchema>;

const DEFAULT_CONFIG: Config = {
  model: "deepseek-chat",
  provider: "deepseek",
  workingDirectory: process.cwd(),
  maxContextTokens: 128_000,
  tools: {
    readFile: true,
    writeFile: true,
    editFile: true,
    listFiles: true,
    runCommand: true,
    search: true,
  },
  requireConfirmation: {
    delete: true,
    riskyCommand: true,
    outsideWorkingDir: true,
  },
  apiKeyEnvVar: {
    deepseek: "DEEPSEEK_API_KEY",
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
  },
  deepseekBaseUrl: "https://api.deepseek.com",
};

function findConfigFile(): string | null {
  const candidates = [
    join(process.cwd(), "agent.config.json"),
    join(homedir(), ".code-cli", "config.json"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

export function loadConfig(): Config {
  const configPath = findConfigFile();
  if (!configPath) return { ...DEFAULT_CONFIG };

  try {
    const raw = JSON.parse(readFileSync(configPath, "utf-8"));
    const merged = { ...DEFAULT_CONFIG, ...raw };
    return ConfigSchema.parse(merged);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function resolvePath(config: Config, p: string): string {
  if (p.startsWith("/")) return p;
  return resolve(config.workingDirectory, p);
}
