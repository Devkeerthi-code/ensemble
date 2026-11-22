import "dotenv/config";
import { PgBoss } from "pg-boss";
import { PROVIDERS, PROVIDER_LIMITS } from "../src/lib/orchestrator/catalog";
import { aiSdkClient } from "../src/lib/orchestrator/ai-sdk-client";
import { DEFAULT_CONFIG, processTask, reconcileRun, type EngineDeps } from "../src/lib/orchestrator/engine";
import { ConcurrencyLimiter } from "../src/lib/orchestrator/scheduler";
import { db } from "../src/lib/server/db";
import { prismaStore } from "../src/lib/server/orchestrator/prisma-store";
import { directDatabaseUrl, enqueueTasks, TASK_QUEUE, type TaskJob } from "../src/lib/server/orchestrator/queue";
import { track } from "../src/lib/server/telemetry";

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 8);
const log = (msg: string, extra: Record<string, unknown> = {}) => console.log(JSON.stringify({ t: new Date().toISOString(), msg, ...extra }));

const deps: EngineDeps = {
  store: prismaStore,
  llm: aiSdkClient,
  limiter: new ConcurrencyLimiter({
    perProvider: Object.fromEntries(PROVIDERS.map((p) => [p, PROVIDER_LIMITS[p].concurrency])),
    perUser: Number(process.env.PER_USER_CONCURRENCY ?? 4),
  }),
  config: DEFAULT_CONFIG,
};

/** Resumable runs: anything that was running when the worker stopped is queued again. */
async function recover(boss: PgBoss) {
  const running = await db.run.findMany({ where: { status: "running" }, select: { id: true } });
  for (const r of running) {
    const { enqueue } = await reconcileRun(deps, r.id);
    await enqueueTasks(boss, r.id, enqueue);
  }
  if (running.length) log("recovered runs", { count: running.length });
}

async function main() {
  const boss = new PgBoss({ connectionString: directDatabaseUrl(), max: CONCURRENCY + 2 });
  boss.on("error", (e) => log("queue error", { error: e.message }));
  await boss.start();
  await boss.createQueue(TASK_QUEUE).catch(() => undefined);
  await recover(boss);

  await boss.work<TaskJob>(TASK_QUEUE, { localConcurrency: CONCURRENCY, batchSize: 1, pollingIntervalSeconds: 1 }, async ([job]) => {
    if (!job) return;
    const { runId, key } = job.data;
    // Never log prompts, outputs or keys: only ids and outcome.
    const started = Date.now();
    const result = await processTask(deps, runId, key);
    await enqueueTasks(boss, runId, result.enqueue);
    const run = await db.run.findUnique({ where: { id: runId }, select: { status: true } });
    if (run?.status === "completed") await track("run_completed");
    log("task step", { runId, key, ms: Date.now() - started, next: result.enqueue.length });
  });

  setInterval(() => void recover(boss).catch((e) => log("recover failed", { error: (e as Error).message })), 5 * 60_000).unref();
  log("worker ready", { concurrency: CONCURRENCY });

  const stop = async () => {
    log("worker stopping");
    await boss.stop({ graceful: true, timeout: 20_000 });
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((e) => {
  log("worker crashed", { error: (e as Error).message });
  process.exit(1);
});
