import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { neonPool } from "../src/lib/server/db-transport";

/**
 * `npm run db:deploy:ws` applies Prisma migrations over a WebSocket (port 443) for networks that
 * block 5432. It writes the same _prisma_migrations rows as `prisma migrate deploy`, so both stay in sync.
 */
const dir = path.join(process.cwd(), "prisma", "migrations");
const pool = neonPool(process.env.DATABASE_URL!.replace("-pooler.", "."));

await pool.query(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  id VARCHAR(36) PRIMARY KEY, checksum VARCHAR(64) NOT NULL, finished_at TIMESTAMPTZ, migration_name VARCHAR(255) NOT NULL,
  logs TEXT, rolled_back_at TIMESTAMPTZ, started_at TIMESTAMPTZ NOT NULL DEFAULT now(), applied_steps_count INTEGER NOT NULL DEFAULT 0)`);
const applied = new Set((await pool.query(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`)).rows.map((r) => r.migration_name as string));

for (const name of readdirSync(dir).filter((d) => /^\d{14}_/.test(d)).sort()) {
  if (applied.has(name)) continue;
  const sql = readFileSync(path.join(dir, name, "migration.sql"), "utf8");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query(`INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count) VALUES ($1, $2, now(), $3, 1)`, [randomUUID(), createHash("sha256").update(sql).digest("hex"), name]);
    await client.query("COMMIT");
    console.log(`applied ${name}`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(`failed ${name}: ${(e as Error).message}`);
    process.exitCode = 1;
    break;
  } finally {
    client.release();
  }
}
console.log("migrations up to date");
await pool.end();
