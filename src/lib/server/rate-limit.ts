import "server-only";
import { db } from "./db";

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

/**
 * Fixed-window counter in Postgres. Works across serverless instances, at the cost of one
 * upsert per checked request, which is fine for auth and expensive actions.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const row = await db.rateLimit.upsert({
    where: { key_windowStart: { key, windowStart } },
    create: { key, windowStart, count: 1 },
    update: { count: { increment: 1 } },
    select: { count: true },
  });
  if (row.count <= limit) return { ok: true };
  return { ok: false, retryAfterSeconds: Math.ceil((windowStart.getTime() + windowMs - now) / 1000) };
}
