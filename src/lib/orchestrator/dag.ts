import { z } from "zod";

export const SKILLS = ["research", "writing", "coding", "analysis", "summarising", "checking"] as const;
export type Skill = (typeof SKILLS)[number];

export const planTaskSchema = z.object({
  key: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, "Keys are short lowercase ids like research-1"),
  title: z.string().trim().min(3).max(200),
  skill: z.enum(SKILLS),
  instructions: z.string().trim().min(10).max(4000),
  acceptance: z.string().trim().min(5).max(2000),
  dependsOn: z.array(z.string()).max(12),
  important: z.boolean(),
});
export type PlanTask = z.infer<typeof planTaskSchema>;

export const planSchema = z.object({ tasks: z.array(planTaskSchema).min(1).max(25) });
export type Plan = z.infer<typeof planSchema>;

export type DagError = { code: "duplicate" | "missing" | "self" | "cycle"; message: string; keys: string[] };

/** Returns one cycle as a key path (a → b → a), or null. Iterative DFS with colours. */
export function findCycle(tasks: Pick<PlanTask, "key" | "dependsOn">[]): string[] | null {
  const deps = new Map(tasks.map((t) => [t.key, t.dependsOn]));
  const colour = new Map<string, 0 | 1 | 2>();
  for (const start of deps.keys()) {
    if (colour.get(start)) continue;
    const stack: Array<{ key: string; i: number }> = [{ key: start, i: 0 }];
    const path: string[] = [start];
    colour.set(start, 1);
    while (stack.length) {
      const top = stack[stack.length - 1]!;
      const next = deps.get(top.key)?.[top.i++];
      if (next === undefined) {
        colour.set(top.key, 2);
        stack.pop();
        path.pop();
      } else if (!deps.has(next)) {
        continue;
      } else if (colour.get(next) === 1) {
        return [...path.slice(path.indexOf(next)), next];
      } else if (!colour.get(next)) {
        colour.set(next, 1);
        stack.push({ key: next, i: 0 });
        path.push(next);
      }
    }
  }
  return null;
}

export function validateDag(tasks: Pick<PlanTask, "key" | "dependsOn">[]): DagError[] {
  const errors: DagError[] = [];
  const seen = new Set<string>();
  for (const t of tasks) {
    if (seen.has(t.key)) errors.push({ code: "duplicate", message: `Two tasks share the key "${t.key}".`, keys: [t.key] });
    seen.add(t.key);
  }
  for (const t of tasks) {
    if (t.dependsOn.includes(t.key)) errors.push({ code: "self", message: `"${t.key}" depends on itself.`, keys: [t.key] });
    for (const d of t.dependsOn) {
      if (!seen.has(d)) errors.push({ code: "missing", message: `"${t.key}" depends on "${d}", which doesn't exist.`, keys: [t.key, d] });
    }
  }
  if (errors.length === 0) {
    const cycle = findCycle(tasks);
    if (cycle) errors.push({ code: "cycle", message: `These tasks wait on each other forever: ${cycle.join(" → ")}.`, keys: cycle });
  }
  return errors;
}

/** Kahn's algorithm. Assumes a valid DAG. */
export function topoOrder<T extends Pick<PlanTask, "key" | "dependsOn">>(tasks: T[]): T[] {
  const indeg = new Map(tasks.map((t) => [t.key, t.dependsOn.length]));
  const byKey = new Map(tasks.map((t) => [t.key, t]));
  const queue = tasks.filter((t) => t.dependsOn.length === 0).map((t) => t.key);
  const out: T[] = [];
  while (queue.length) {
    const k = queue.shift()!;
    out.push(byKey.get(k)!);
    for (const t of tasks) {
      if (!t.dependsOn.includes(k)) continue;
      const n = indeg.get(t.key)! - 1;
      indeg.set(t.key, n);
      if (n === 0) queue.push(t.key);
    }
  }
  return out;
}

/** Longest chain of tasks from each task to the end (inclusive). Bigger = more on the critical path. */
export function criticalPathLengths(tasks: Pick<PlanTask, "key" | "dependsOn">[]): Map<string, number> {
  const lengths = new Map<string, number>();
  for (const t of [...topoOrder(tasks)].reverse()) {
    const dependents = tasks.filter((d) => d.dependsOn.includes(t.key));
    lengths.set(t.key, 1 + Math.max(0, ...dependents.map((d) => lengths.get(d.key) ?? 0)));
  }
  return lengths;
}

/** Depth of each task (0 = no dependencies). Used to lay out the graph in columns. */
export function depths(tasks: Pick<PlanTask, "key" | "dependsOn">[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of topoOrder(tasks)) out.set(t.key, t.dependsOn.length ? 1 + Math.max(...t.dependsOn.map((d) => out.get(d) ?? 0)) : 0);
  return out;
}

/**
 * Moves a task up (-1) or down (+1) among the tasks in its graph column, which is the order the graph draws rows in.
 * Returns the same array when there is nowhere to move. A broken graph is treated as one column, as the graph draws it.
 */
export function moveInColumn<T extends Pick<PlanTask, "key" | "dependsOn">>(tasks: T[], key: string, dir: -1 | 1): T[] {
  const depth = validateDag(tasks).length ? new Map<string, number>() : depths(tasks);
  const column = (k: string) => depth.get(k) ?? 0;
  const from = tasks.findIndex((t) => t.key === key);
  if (from < 0) return tasks;
  let to = from + dir;
  while (to >= 0 && to < tasks.length && column(tasks[to]!.key) !== column(key)) to += dir;
  if (to < 0 || to >= tasks.length) return tasks;
  const out = [...tasks];
  [out[from], out[to]] = [out[to]!, out[from]!];
  return out;
}

