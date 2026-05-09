# code-cli

AI-powered CLI coding assistant — like Claude Code, built with TypeScript. Uses DeepSeek by default.

## Quickstart

```bash
git clone https://github.com/Hari-krishna-tech/code-cli.git
cd code-cli
npm install
npm run build
npm link
```

`npm link` creates a global symlink so `code-cli` works from **any directory**.

Set your API key:

```bash
export DEEPSEEK_API_KEY="sk-your-key-here"
```

Then run from anywhere:

```bash
code-cli
```

Or with a prompt directly:

```bash
code-cli "explain this codebase"
```

## Run from any directory (3 options)

### Option 1: npm link (recommended for development)

```bash
# From the project directory
npm link
```

This symlinks the package globally. Now `code-cli` works from any directory. When you `git pull` updates, just rebuild (`npm run build`) — the link stays live.

### Option 2: npm install globally

```bash
npm install -g /path/to/code-cli
```

### Option 3: Add to PATH

```bash
export PATH="/path/to/code-cli:$PATH"
chmod +x /path/to/code-cli/dist/index.js
```

## Commands

```
code-cli              Start interactive REPL
code-cli --help       Show help
code-cli --version    Show version
```

### REPL Commands

| Command | Action |
|---------|--------|
| `/help` | Show available commands |
| `/clear` | Clear conversation history |
| `/config` | Show current configuration |
| `/exit`, `/quit` | Exit |
| `Ctrl+C` | Exit |

## Tools Available to the Agent

- **read_file** — Read file contents with line numbers
- **write_file** — Create or overwrite a file
- **edit_file** — Find-and-replace within a file
- **list_files** — List directory contents
- **run_command** — Execute shell commands (risky commands blocked by default)
- **search** — Grep-like code search with regex support

## Configuration

Config is loaded from (in order):

1. `agent.config.json` in current directory
2. `~/.code-cli/config.json` in home directory

Example `agent.config.json`:

```json
{
  "model": "deepseek-chat",
  "provider": "deepseek",
  "workingDirectory": "/path/to/project",
  "maxContextTokens": 128000,
  "tools": {
    "readFile": true,
    "writeFile": true,
    "editFile": true,
    "listFiles": true,
    "runCommand": true,
    "search": true
  },
  "requireConfirmation": {
    "delete": true,
    "riskyCommand": true,
    "outsideWorkingDir": true
  }
}
```

### Providers

Default is DeepSeek. Set `DEEPSEEK_API_KEY` env var.

To add OpenAI or Anthropic, implement the `LLMProvider` interface in `src/llm/` and register in `src/llm/provider.ts`:

```ts
interface LLMProvider {
  name: string;
  chat(
    messages: Message[],
    tools: Array<{ type: "function"; function: ToolDefinition }>,
    onChunk?: (chunk: StreamChunk) => void,
  ): Promise<LLMResponse>;
}
```

## Architecture

```
src/
├── index.ts             # Entry point
├── agent/
│   └── loop.ts          # Agent loop — orchestrates LLM + tools
├── cli/
│   ├── repl.ts          # Interactive REPL with readline
│   └── renderer.ts      # Pretty terminal output (chalk)
├── llm/
│   ├── types.ts         # Message, ToolCall, LLMProvider types
│   ├── context.ts       # Token-aware context trimming
│   ├── deepseek.ts      # DeepSeek API provider (streaming + tool calls)
│   └── provider.ts      # Provider factory
├── tools/
│   ├── types.ts         # Tool interface and JSON schemas
│   ├── registry.ts      # Tool registry — registers and dispatches
│   ├── read-file.ts     # Read file with line numbers
│   ├── write-file.ts    # Create/overwrite file
│   ├── edit-file.ts     # Find-and-replace edit
│   ├── list-files.ts    # Directory listing with sizes
│   ├── run-command.ts   # Shell execution with safety checks
│   └── search.ts        # Grep-like search
└── utils/
    ├── config.ts        # Zod-validated config loading
    └── logger.ts        # Structured logger + token estimator
```

## Autoresearch

Automated experiment loop — AI modifies code, runs evals, keeps improvements, reverts failures. Inspired by [karpathy/autoresearch](https://github.com/karpathy/autoresearch).

### Concept

```
main
 └── experiment branch (exp-<timestamp>-<random>)
      ├── AI modifies code via headless agent
      ├── run eval suite → MetricSnapshot
      ├── score > baseline?
      ├── KEEP   → git commit, update baseline
      └── REVERT → git reset --hard, delete branch
                   ↑ repeat N times
```

### CLI commands

```bash
code-cli --run "improve tool selection accuracy"
code-cli --eval
code-cli --experiment
code-cli --experiment --experiment-iterations 20
code-cli --experiment --experiment-prompt "reduce token usage by 15%"
code-cli --experiment --experiment-config ./experiments/config.json
```

### Architecture

```
src/autoresearch/
├── types.ts        # EvalCase, EvalResult, MetricSnapshot, ExperimentRecord
├── git.ts          # Zero-dep git sandboxing (branch, commit, revert)
├── runner.ts       # Non-interactive agent runner (headless)
├── evaluator.ts    # Eval harness with pass/fail scoring + 5 built-in evals
├── store.ts        # JSON-file experiment history with trend detection
└── loop.ts         # Main experiment loop orchestrator
```

### Experiment config

```json
{
  "maxIterations": 10,
  "minScoreDelta": 0.01,
  "improvementPrompt": "Analyze src/agent/loop.ts. Find one concrete improvement that reduces average tool calls by 20% without lowering success rate. Make the change.",
  "evals": [
    {
      "name": "read-existing-file",
      "description": "Agent can read an existing source file",
      "prompt": "Read src/index.ts and summarize it in one sentence.",
      "expectedOutput": ["entry point", "REPL"],
      "expectedFiles": [],
      "maxToolCalls": 3,
      "timeout": 30000
    }
  ]
}
```

### Eval metrics tracked

| Metric | What it measures |
|--------|-----------------|
| `evalScore` | Aggregate pass/fail score across all eval cases (0..1) |
| `successRate` | Percentage of eval cases fully passed |
| `avgTokens` | Average tokens consumed per eval case |
| `avgLatencyMs` | Average wall-clock time per eval case |
| `avgToolCalls` | Average tool calls per eval case |

### Built-in evals

Start with 5 generic evals (read, list, search, explain, no-hallucination). Replace with project-specific evals for real results — eval quality determines experiment quality.

### Experiment store

Records stored in `.autoresearch/experiments.json`. Each record:

```json
{
  "id": "exp-m7f3k2a1-abc12345",
  "timestamp": 1715299200000,
  "branch": "exp-m7f3k2a1-abc12345",
  "prompt": "reduce token usage by 15%",
  "baseline": { "evalScore": 0.71, "successRate": 0.6, "avgTokens": 4500, "avgLatencyMs": 3200, "avgToolCalls": 4.2 },
  "result":   { "evalScore": 0.79, "successRate": 0.8, "avgTokens": 3800, "avgLatencyMs": 2900, "avgToolCalls": 3.1 },
  "changes": ["src/agent/loop.ts", "src/llm/context.ts"],
  "diffSummary": "2 files changed, 15 insertions(+), 8 deletions(-)",
  "success": true
}
```

### Critical design rules

1. **AI never touches main** — all changes happen on experiment branches
2. **Evals first** — without measurable criteria, autoresearch is random vibe coding
3. **Specific goals** — "reduce token usage by 15%" not "improve the project"
4. **Small deltas** — one focused change per iteration beats sweeping refactors
5. **Sandbox everything** — never let agent touch `.env`, deployment configs, or billing code

## Security

- **Sandboxing**: File access restricted to working directory (configurable)
- **Risky commands blocked**: `rm -rf`, `git push --force`, `DROP TABLE`, pipe-to-shell, etc.
- **Confirmation for destructive ops**: Configurable in `agent.config.json`

## Extending

### Adding a tool

1. Create `src/tools/my-tool.ts` implementing the `Tool` interface
2. Register it in `src/tools/registry.ts`
3. Add its config toggle in `src/utils/config.ts`

### Adding an LLM provider

1. Create `src/llm/my-provider.ts` implementing `LLMProvider`
2. Add to the switch in `src/llm/provider.ts`
3. Add the API key env var to config
