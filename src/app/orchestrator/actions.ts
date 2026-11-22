"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { rateLimit } from "@/lib/server/rate-limit";
import { requireUser } from "@/lib/server/session";
import { cloneRun, createGoal, decideApproval, goalSchema, launchRun, replacePlan, setRunState } from "@/lib/server/orchestrator/runs";

export type FormState = { error?: string; fieldErrors?: Record<string, string | undefined> };
type Result = { ok: boolean; error?: string; errors?: string[] };

const id = z.cuid();

export async function createGoalAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = goalSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const fe = parsed.error.flatten().fieldErrors;
    return { fieldErrors: Object.fromEntries(Object.entries(fe).map(([k, v]) => [k, v?.[0]])) };
  }
  const limited = await rateLimit(`plan:${user.id}`, 20, 60 * 60);
  if (!limited.ok) return { error: "You've planned a lot of goals this hour. Try again shortly." };
  const { runId, planError } = await createGoal(user.id, parsed.data);
  redirect(`/orchestrator/runs/${runId}${planError ? `?planError=${encodeURIComponent(planError)}` : ""}`);
}

export async function savePlanAction(runId: string, plan: unknown): Promise<Result> {
  const user = await requireUser();
  if (!id.safeParse(runId).success) return { ok: false, error: "Bad run id" };
  const res = await replacePlan(user.id, runId, plan);
  return res.ok ? { ok: true } : { ok: false, errors: res.errors };
}

export async function launchRunAction(runId: string, plan: unknown): Promise<Result> {
  const user = await requireUser();
  if (!id.safeParse(runId).success) return { ok: false, error: "Bad run id" };
  const limited = await rateLimit(`launch:${user.id}`, 30, 60 * 60);
  if (!limited.ok) return { ok: false, error: "Too many runs started this hour." };
  const saved = await replacePlan(user.id, runId, plan);
  if (!saved.ok) return { ok: false, errors: saved.errors };
  const res = await launchRun(user.id, runId);
  revalidatePath(`/orchestrator/runs/${runId}`);
  return res;
}

export async function runControlAction(runId: string, action: "pause" | "resume" | "cancel"): Promise<Result> {
  const user = await requireUser();
  if (!id.safeParse(runId).success || !["pause", "resume", "cancel"].includes(action)) return { ok: false, error: "Bad request" };
  return setRunState(user.id, runId, action);
}

export async function rerunAction(runId: string): Promise<void> {
  const user = await requireUser();
  if (!id.safeParse(runId).success) return;
  const copy = await cloneRun(user.id, runId);
  if (copy) redirect(`/orchestrator/runs/${copy}`);
}

export async function approvalAction(approvalId: string, approve: boolean): Promise<Result> {
  const user = await requireUser();
  if (!id.safeParse(approvalId).success) return { ok: false, error: "Bad approval id" };
  return decideApproval(user.id, approvalId, approve);
}
