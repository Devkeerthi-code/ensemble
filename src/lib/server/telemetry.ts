import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";

export const USAGE_EVENTS = [
  "signup",
  "setup_saved",
  "zip_downloaded",
  "cli_copied",
  "doctor_run",
  "goal_planned",
  "run_started",
  "run_completed",
] as const;
export type UsageEvent = (typeof USAGE_EVENTS)[number];

/** Counts only. Never blocks the request if logging fails. */
export async function track(event: UsageEvent): Promise<void> {
  await db.usageEvent.create({ data: { event } }).catch(() => undefined);
}

export async function audit(action: string, opts: { userId?: string; target?: string; meta?: Prisma.InputJsonValue } = {}): Promise<void> {
  await db.auditLog.create({ data: { action, userId: opts.userId, target: opts.target, meta: opts.meta } }).catch(() => undefined);
}
