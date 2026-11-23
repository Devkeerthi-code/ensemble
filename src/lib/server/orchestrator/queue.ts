import { PgBoss, type ConstructorOptions } from "pg-boss";
import type { Enqueue } from "@/lib/orchestrator/engine";
import { neonPool, websocketTransport } from "../db-transport";
import { normalisePgUrl } from "../pg-url";

export const TASK_QUEUE = "ensemble-task";
export type TaskJob = { runId: string; key: string };

/** pg-boss and LISTEN/advisory locks need a direct (non-pooled) connection. Neon's direct host drops "-pooler". */
export function directDatabaseUrl(): string {
  const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return normalisePgUrl(process.env.DIRECT_DATABASE_URL ? url : url.replace("-pooler.", "."));
}

/** Connection options for pg-boss: TCP by default, or a Neon WebSocket pool when port 5432 is blocked. */
export function bossConnection(max: number): ConstructorOptions {
  if (!websocketTransport()) return { connectionString: directDatabaseUrl(), max };
  const pool = neonPool(directDatabaseUrl());
  return { db: { executeSql: async (text, values) => ({ rows: (await pool.query(text, values as unknown[])).rows }) } };
}

const g = globalThis as unknown as { boss?: Promise<PgBoss> };

/** Web-side client: sends jobs only. Migrations and maintenance run in the worker. */
export function senderBoss(): Promise<PgBoss> {
  g.boss ??= (async () => {
    const boss = new PgBoss({ ...bossConnection(2), supervise: false, schedule: false, migrate: false });
    boss.on("error", () => undefined);
    await boss.start();
    return boss;
  })();
  return g.boss;
}

/** singletonKey stops the same task being queued twice at the same moment; the engine is idempotent anyway. */
export async function enqueueTasks(boss: PgBoss, runId: string, items: Enqueue[]): Promise<void> {
  for (const i of items) {
    await boss.send(TASK_QUEUE, { runId, key: i.key } satisfies TaskJob, {
      priority: i.priority,
      startAfter: i.delayMs > 0 ? Math.ceil(i.delayMs / 1000) : undefined,
      singletonKey: i.delayMs > 0 ? undefined : `${runId}:${i.key}`,
      singletonSeconds: i.delayMs > 0 ? undefined : 2,
      retryLimit: 2,
      retryDelay: 5,
      retryBackoff: true,
      expireInSeconds: 300,
    });
  }
}
