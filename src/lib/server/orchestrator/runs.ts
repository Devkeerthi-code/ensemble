import { z } from "zod";
import { planSchema, validateDag, type Plan } from "@/lib/orchestrator/dag";
import { reconcileRun, resolveApproval, startRun, DEFAULT_CONFIG, type EngineDeps } from "@/lib/orchestrator/engine";
import { aiSdkClient } from "@/lib/orchestrator/ai-sdk-client";
import { ConcurrencyLimiter } from "@/lib/orchestrator/scheduler";
import { db } from "../db";
import { audit, track } from "../telemetry";
import { planGoal } from "./planner";
import { prismaStore } from "./prisma-store";
import { enqueueTasks, senderBoss } from "./queue";

export const goalSchema = z.object({
  title: z.string().trim().min(10, "Describe the goal in a sentence").max(200),
  criteria: z.string().trim().min(5, "Say how you'll know it's done").max(2000),
  priority: z.enum(["high", "normal", "low"]),
  budgetUsd: z.coerce.number().min(0.01, "Minimum budget is $0.01").max(Number(process.env.MAX_RUN_BUDGET_USD ?? 5), `Maximum budget per run is $${process.env.MAX_RUN_BUDGET_USD ?? 5}`),
  preference: z.enum(["quality", "speed", "cost"]),
});
export type GoalInput = z.infer<typeof goalSchema>;

/** The web process only enqueues; the worker does the work. Limits here are unused but satisfy the engine. */
const webDeps = (): EngineDeps => ({ store: prismaStore, llm: aiSdkClient, limiter: new ConcurrencyLimiter({ perProvider: {}, perUser: 0 }), config: DEFAULT_CONFIG });

/** Every query below filters by userId: a user can only ever see or change their own runs. */
export async function ownedRun(userId: string, runId: string) {
  return db.run.findFirst({ where: { id: runId, userId }, include: { goal: true, tasks: { orderBy: { key: "asc" } } } });
}

export async function createGoal(userId: string, input: GoalInput): Promise<{ runId: string; planError?: string }> {
  const goal = await db.goal.create({ data: { userId, ...input } });
  const run = await db.run.create({ data: { userId, goalId: goal.id, priority: input.priority, budgetUsd: input.budgetUsd }, select: { id: true } });
  await audit("goal_created", { userId, target: run.id });
  const planned = await planGoal({ runId: run.id, userId, ...input });
  if (planned.ok) {
    await replacePlan(userId, run.id, planned.plan);
    await prismaStore.event(run.id, "plan", { model: planned.model, costUsd: planned.costUsd });
    await track("goal_planned");
    return { runId: run.id };
  }
  return { runId: run.id, planError: planned.error };
}

export async function replacePlan(userId: string, runId: string, raw: unknown): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  const parsed = planSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  const dagErrors = validateDag(parsed.data.tasks);
  if (dagErrors.length) return { ok: false, errors: dagErrors.map((e) => e.message) };
  const run = await db.run.findFirst({ where: { id: runId, userId, status: "draft" }, select: { id: true } });
  if (!run) return { ok: false, errors: ["Only draft runs can be edited."] };
  const plan: Plan = parsed.data;
  await db.$transaction([
    db.task.deleteMany({ where: { runId } }),
    db.task.createMany({ data: plan.tasks.map((t) => ({ runId, ...t })) }),
  ]);
  return { ok: true };
}

export async function launchRun(userId: string, runId: string): Promise<{ ok: boolean; error?: string }> {
  const run = await ownedRun(userId, runId);
  if (!run || run.status !== "draft") return { ok: false, error: "This run has already started." };
  if (run.tasks.length === 0) return { ok: false, error: "Add at least one task first." };
  if (await prismaStore.killSwitch()) return { ok: false, error: "Runs are paused for everyone by the kill switch. Try again later." };
  try {
    const { enqueue } = await startRun(webDeps(), runId);
    await enqueueTasks(await senderBoss(), runId, enqueue);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  await Promise.all([track("run_started"), audit("run_started", { userId, target: runId })]);
  return { ok: true };
}

export async function setRunState(userId: string, runId: string, action: "pause" | "resume" | "cancel"): Promise<{ ok: boolean; error?: string }> {
  const run = await ownedRun(userId, runId);
  if (!run) return { ok: false, error: "Run not found." };
  if (action === "pause" && run.status === "running") {
    await db.run.update({ where: { id: runId }, data: { status: "paused" } });
  } else if (action === "resume" && run.status === "paused") {
    if (await prismaStore.killSwitch()) return { ok: false, error: "The kill switch is on." };
    await db.run.update({ where: { id: runId }, data: { status: "running", error: null } });
    const { enqueue } = await reconcileRun(webDeps(), runId);
    await enqueueTasks(await senderBoss(), runId, enqueue);
  } else if (action === "cancel" && ["running", "paused", "queued", "draft"].includes(run.status)) {
    await db.$transaction([
      db.task.updateMany({ where: { runId, status: { in: ["pending", "queued", "waiting_approval"] } }, data: { status: "cancelled", error: "Cancelled by you" } }),
      db.run.update({ where: { id: runId }, data: { status: "cancelled", finishedAt: new Date() } }),
      db.approval.updateMany({ where: { runId, status: "pending" }, data: { status: "rejected", decidedAt: new Date() } }),
    ]);
  } else {
    return { ok: false, error: `Can't ${action} a run that is ${run.status}.` };
  }
  await prismaStore.event(runId, "run", { status: action === "pause" ? "paused" : action === "resume" ? "running" : "cancelled" });
  await audit(`run_${action}`, { userId, target: runId });
  return { ok: true };
}

/** Re-run = a fresh draft with the same plan, so the user can tweak it before launching again. */
export async function cloneRun(userId: string, runId: string): Promise<string | null> {
  const run = await ownedRun(userId, runId);
  if (!run) return null;
  const copy = await db.run.create({ data: { userId, goalId: run.goalId, priority: run.priority, budgetUsd: run.budgetUsd }, select: { id: true } });
  await db.task.createMany({ data: run.tasks.map((t) => ({ runId: copy.id, key: t.key, title: t.title, skill: t.skill, instructions: t.instructions, acceptance: t.acceptance, dependsOn: t.dependsOn, important: t.important })) });
  await audit("run_cloned", { userId, target: copy.id, meta: { from: runId } });
  return copy.id;
}

export async function decideApproval(userId: string, approvalId: string, approve: boolean): Promise<{ ok: boolean; error?: string }> {
  const approval = await db.approval.findFirst({ where: { id: approvalId, userId, status: "pending" } });
  if (!approval) return { ok: false, error: "This approval was already decided." };
  await db.approval.update({ where: { id: approvalId }, data: { status: approve ? "approved" : "rejected", decidedAt: new Date() } });
  const task = approval.taskId ? await db.task.findUnique({ where: { id: approval.taskId }, select: { key: true } }) : null;
  if (task) {
    const { enqueue } = await resolveApproval(webDeps(), approval.runId, task.key, approve);
    if (enqueue.length) await enqueueTasks(await senderBoss(), approval.runId, enqueue);
  }
  await audit(approve ? "approval_granted" : "approval_rejected", { userId, target: approvalId });
  return { ok: true };
}
