import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import type { ExperimentRecord, MetricSnapshot } from "./types.js";

const DEFAULT_STORE_PATH = join(process.cwd(), ".autoresearch", "experiments.json");

export class ExperimentStore {
  private records: ExperimentRecord[];
  private path: string;

  constructor(path?: string) {
    this.path = path ?? DEFAULT_STORE_PATH;
    this.records = this.load();
  }

  record(entry: ExperimentRecord): void {
    this.records.push(entry);
    this.save();
  }

  getAll(): ExperimentRecord[] {
    return this.records;
  }

  getRecent(limit = 10): ExperimentRecord[] {
    return this.records.slice(-limit).reverse();
  }

  getSuccessful(): ExperimentRecord[] {
    return this.records.filter((r) => r.success);
  }

  getFailed(): ExperimentRecord[] {
    return this.records.filter((r) => !r.success);
  }

  trend(): { improving: boolean; streak: number; lastN: MetricSnapshot[] } {
    const lastN = this.records.slice(-10).map((r) => r.result);
    let streak = 0;

    // Count consecutive improvements from the end
    for (let i = this.records.length - 1; i > 0; i--) {
      if (this.records[i].success) {
        streak++;
      } else {
        break;
      }
    }

    const improving =
      lastN.length >= 3 &&
      lastN[lastN.length - 1].evalScore > lastN[0].evalScore;

    return { improving, streak, lastN };
  }

  bestScore(): number {
    if (this.records.length === 0) return 0;
    return Math.max(...this.records.map((r) => r.result.evalScore));
  }

  private load(): ExperimentRecord[] {
    try {
      if (existsSync(this.path)) {
        const raw = readFileSync(this.path, "utf-8");
        return JSON.parse(raw);
      }
    } catch {
      // corrupt file, start fresh
    }
    return [];
  }

  private save(): void {
    const dir = dirname(this.path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.path, JSON.stringify(this.records, null, 2));
  }
}
