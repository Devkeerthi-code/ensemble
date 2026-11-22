"use server";

import { z } from "zod";
import { runDoctor, type DoctorReport } from "@/lib/doctor";
import { rateLimit } from "@/lib/server/rate-limit";
import { clientIp } from "@/lib/server/request";
import { track } from "@/lib/server/telemetry";

const input = z
  .array(z.object({ path: z.string().trim().min(1).max(200), content: z.string().max(100_000) }))
  .min(1, "Add at least one file")
  .max(60, "Doctor checks up to 60 files at a time");

export type DoctorResult = { ok: true; report: DoctorReport } | { ok: false; error: string };

export async function runDoctorAction(files: unknown): Promise<DoctorResult> {
  const parsed = input.safeParse(files);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid files" };
  const limited = await rateLimit(`doctor:${await clientIp()}`, 60, 60 * 60);
  if (!limited.ok) return { ok: false, error: `Too many checks. Try again in ${Math.ceil(limited.retryAfterSeconds / 60)} minutes.` };
  await track("doctor_run");
  return { ok: true, report: runDoctor(parsed.data) };
}
