import { criticalPathLengths, type PlanTask } from "./dag";

export type Priority = "high" | "normal" | "low";
export type TaskState = "pending" | "queued" | "running" | "waiting_approval" | "done" | "failed" | "cancelled";
export type SchedTask = Pick<PlanTask, "key" | "dependsOn"> & { status: TaskState };

const PRIORITY_WEIGHT: Record<Priority, number> = { high: 3, normal: 2, low: 1 };

/** Queue priority: run priority dominates, then critical-path length, so long chains start first. */
export function taskPriority(runPriority: Priority, criticalPath: number): number {
  return PRIORITY_WEIGHT[runPriority] * 1000 + Math.min(criticalPath, 99) * 10;
}

/** Pending tasks whose dependencies are all done. */
export function readyTasks<T extends SchedTask>(tasks: T[]): T[] {
  const done = new Set(tasks.filter((t) => t.status === "done").map((t) => t.key));
  return tasks.filter((t) => t.status === "pending" && t.dependsOn.every((d) => done.has(d)));
}

/** Tasks that can never run because something upstream failed or was cancelled. */
export function blockedTasks<T extends SchedTask>(tasks: T[]): T[] {
  const dead = new Set(tasks.filter((t) => t.status === "failed" || t.status === "cancelled").map((t) => t.key));
  let changed = true;
  const blocked = new Set<string>();
  while (changed) {
    changed = false;
    for (const t of tasks) {
      if (t.status === "pending" && !blocked.has(t.key) && t.dependsOn.some((d) => dead.has(d) || blocked.has(d))) {
        blocked.add(t.key);
        changed = true;
      }
    }
  }
  return tasks.filter((t) => blocked.has(t.key));
}

export type RunRef = { runId: string; userId: string; priority: Priority; createdAt: number };
export type Candidate = { run: RunRef; key: string; priority: number };

/** Orders ready work across runs: priority, then oldest run first (fairness), then key for stability. */
export function orderCandidates(cands: Candidate[]): Candidate[] {
  return [...cands].sort((a, b) => b.priority - a.priority || a.run.createdAt - b.run.createdAt || a.key.localeCompare(b.key));
}

export function candidatesFor(run: RunRef, tasks: SchedTask[]): Candidate[] {
  const cp = criticalPathLengths(tasks);
  return readyTasks(tasks).map((t) => ({ run, key: t.key, priority: taskPriority(run.priority, cp.get(t.key) ?? 1) }));
}

export type Limits = { perProvider: Record<string, number>; perUser: number };

/** Concurrency gate. In-process: one worker owns its counters; see README for the multi-worker caveat. */
export class ConcurrencyLimiter {
  private provider = new Map<string, number>();
  private user = new Map<string, number>();
  constructor(private limits: Limits) {}

  tryAcquire(provider: string, userId: string): boolean {
    const p = this.provider.get(provider) ?? 0;
    const u = this.user.get(userId) ?? 0;
    if (p >= (this.limits.perProvider[provider] ?? 2) || u >= this.limits.perUser) return false;
    this.provider.set(provider, p + 1);
    this.user.set(userId, u + 1);
    return true;
  }

  release(provider: string, userId: string): void {
    this.provider.set(provider, Math.max(0, (this.provider.get(provider) ?? 1) - 1));
    this.user.set(userId, Math.max(0, (this.user.get(userId) ?? 1) - 1));
  }

  inFlight(provider: string): number {
    return this.provider.get(provider) ?? 0;
  }
}
