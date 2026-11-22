import { processTask, startRun, type EngineDeps, type Enqueue } from "./engine";

/**
 * Drives the engine without Postgres: an in-memory priority queue with real timers.
 * Used by tests and the benchmark; production uses pg-boss in the worker (same engine calls).
 */
export async function runInMemory(deps: EngineDeps, runId: string, opts: { concurrency: number; maxSteps?: number }): Promise<{ steps: number; order: string[] }> {
  const queue: Array<Enqueue & { readyAt: number }> = [];
  const order: string[] = [];
  let active = 0;
  let steps = 0;
  const push = (items: Enqueue[]) => queue.push(...items.map((i) => ({ ...i, readyAt: Date.now() + i.delayMs })));
  push((await startRun(deps, runId)).enqueue);

  await new Promise<void>((resolve, reject) => {
    const tick = () => {
      if (steps > (opts.maxSteps ?? 500)) return reject(new Error("Too many steps"));
      const now = Date.now();
      queue.sort((a, b) => b.priority - a.priority);
      while (active < opts.concurrency) {
        const idx = queue.findIndex((q) => q.readyAt <= now);
        if (idx < 0) break;
        const [job] = queue.splice(idx, 1);
        active++;
        steps++;
        order.push(job!.key);
        processTask(deps, runId, job!.key)
          .then((r) => push(r.enqueue))
          .catch(reject)
          .finally(() => {
            active--;
            setImmediate(tick);
          });
      }
      if (active === 0 && queue.length === 0) return resolve();
      if (active === 0) {
        const soonest = Math.min(...queue.map((q) => q.readyAt));
        setTimeout(tick, Math.max(1, soonest - now));
      }
    };
    tick();
  });
  return { steps, order };
}
