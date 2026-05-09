import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";

function run(cmd: string, cwd?: string): string {
  return execSync(cmd, {
    cwd,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

function runSafe(cmd: string, cwd?: string): string | null {
  try {
    return run(cmd, cwd);
  } catch {
    return null;
  }
}

export function generateBranchName(prefix = "exp"): string {
  const slug = randomBytes(4).toString("hex");
  const ts = Date.now().toString(36);
  return `${prefix}-${ts}-${slug}`;
}

export function createExperimentBranch(name: string): string {
  const current = run("git rev-parse --abbrev-ref HEAD");
  run(`git checkout -b ${name}`);
  return current; // return original branch for later restore
}

export function commitChanges(message: string): boolean {
  const status = runSafe("git status --porcelain");
  if (!status) return false; // nothing to commit

  run("git add -A");
  run(`git commit -m "${message.replace(/"/g, '\\"')}"`);
  return true;
}

export function revertChanges(): void {
  runSafe("git reset --hard HEAD");
  runSafe("git clean -fd");
}

export function getCurrentBranch(): string {
  return run("git rev-parse --abbrev-ref HEAD");
}

export function switchToBranch(branch: string): void {
  run(`git checkout ${branch}`);
}

export function deleteBranch(name: string): void {
  runSafe(`git branch -D ${name}`);
}

export function getChangedFiles(sinceBranch: string): string[] {
  const output = runSafe(`git diff --name-only ${sinceBranch}...HEAD`);
  if (!output) return [];
  return output.split("\n").filter(Boolean);
}

export function getDiffSummary(sinceBranch: string): string {
  const stat = runSafe(`git diff --stat ${sinceBranch}...HEAD`);
  return stat || "(no changes)";
}

export function getDiff(sinceBranch: string): string {
  const diff = runSafe(`git diff ${sinceBranch}...HEAD`);
  return diff || "";
}

export function stashPush(): void {
  runSafe("git stash push --include-untracked");
}

export function stashPop(): void {
  runSafe("git stash pop");
}

export function isRepoClean(): boolean {
  const status = runSafe("git status --porcelain");
  return !status;
}
