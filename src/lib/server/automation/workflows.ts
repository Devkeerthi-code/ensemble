import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { minIntervalMinutes, nextRun, parseCron } from "@/lib/automation/cron";
import { planDelivery, validateDeliveryUrl } from "@/lib/automation/delivery";
import { findTemplate, instantiate } from "@/lib/automation/templates";
import { planSchema, type Plan } from "@/lib/orchestrator/dag";
import { sha256 } from "@/lib/orchestrator/crypto";
import { db } from "../db";
import { audit } from "../telemetry";
import { launchRun } from "../orchestrator/runs";

const MIN_SCHEDULE_MINUTES = 60;
const MAX_BUDGET = Number(process.env.MAX_RUN_BUDGET_USD ?? 5);

export const workflowSettingsSchema = z.object({
  name: z.string().trim().min(3).max(80),
  budgetUsd: z.coerce.number().min(0.01).max(MAX_BUDGET),
  priority: z.enum(["high", "normal", "low"]),
  preference: z.enum(["quality", "speed", "cost"]),
  schedule: z.string().trim().max(60).optional().transform((v) => v || undefined),
  deliveryUrl: z.string().trim().max(500).optional().transform((v) => v || undefined),
});
export type WorkflowSettings = z.infer<typeof workflowSettingsSchema>;

type Checked = { ok: true; nextRunAt: Date | null; deliveryUrl: string | null } | { ok: false; error: string };

/** Schedules must parse, actually fire, and not run more often than hourly (budget safety). */
export function checkSettings(s: Pick<WorkflowSettings, "schedule" | "deliveryUrl">, now = new Date()): Checked {
  let nextRunAt: Date | null = null;
  if (s.schedule) {
    try {
      parseCron(s.schedule);
      if (minIntervalMinutes(s.schedule) < MIN_SCHEDULE_MINUTES) return { ok: false, error: `Schedules can run at most once an hour.` };
      nextRunAt = nextRun(s.schedule, now);
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
  let deliveryUrl: string | null = null;
  if (s.deliveryUrl) {
    const v = validateDeliveryUrl(s.deliveryUrl);
    if (!v.ok) return { ok: false, error: v.error };
    deliveryUrl = v.url;
  }
  return { ok: true, nextRunAt, deliveryUrl };
}

export const ownedWorkflow = (userId: string, id: string) => db.workflow.findFirst({ where: { id, userId } });

export async function createFromTemplate(userId: string, templateId: string, rawInputs: unknown, settings: WorkflowSettings) {
  const built = instantiate(templateId, rawInputs);
  if (!built.ok) return { ok: false as const, error: built.errors.join(" ") };
  const checked = checkSettings(settings);
  if (!checked.ok) return { ok: false as const, error: checked.error };
  const wf = await db.workflow.create({
    data: {
      userId, name: settings.name, template: templateId, ...built.goal, budgetUsd: settings.budgetUsd, priority: settings.priority, preference: settings.preference,
      plan: built.plan as unknown as Prisma.InputJsonValue, inputs: built.inputs, schedule: settings.schedule ?? null, nextRunAt: checked.nextRunAt, deliveryUrl: checked.deliveryUrl,
    },
    select: { id: true },
  });
  await audit("workflow_created", { userId, target: wf.id, meta: { template: templateId } });
  return { ok: true as const, id: wf.id };
}

/** "Save as workflow": reuses a plan the user already reviewed and ran. */
export async function createFromRun(userId: string, runId: string, name: string) {
  const run = await db.run.findFirst({ where: { id: runId, userId }, include: { goal: true, tasks: true } });
  if (!run || run.tasks.length === 0) return { ok: false as const, error: "Run not found" };
  const plan: Plan = { tasks: run.tasks.map(({ key, title, skill, instructions, acceptance, dependsOn, important }) => ({ key, title, skill, instructions, acceptance, dependsOn, important })) };
  const wf = await db.workflow.create({
    data: { userId, name: name.slice(0, 80), title: run.goal.title, criteria: run.goal.criteria, priority: run.priority, preference: run.goal.preference, budgetUsd: run.budgetUsd, plan: plan as unknown as Prisma.InputJsonValue },
    select: { id: true },
  });
  await audit("workflow_created", { userId, target: wf.id, meta: { fromRun: runId } });
  return { ok: true as const, id: wf.id };
}

export async function updateSettings(userId: string, id: string, settings: WorkflowSettings) {
  const checked = checkSettings(settings);
  if (!checked.ok) return { ok: false as const, error: checked.error };
  const res = await db.workflow.updateMany({
    where: { id, userId },
    data: { name: settings.name, budgetUsd: settings.budgetUsd, priority: settings.priority, preference: settings.preference, schedule: settings.schedule ?? null, nextRunAt: checked.nextRunAt, deliveryUrl: checked.deliveryUrl },
  });
  if (res.count === 0) return { ok: false as const, error: "Workflow not found" };
  await audit("workflow_updated", { userId, target: id });
  return { ok: true as const };
}

export async function setEnabled(userId: string, id: string, enabled: boolean) {
  const wf = await ownedWorkflow(userId, id);
  if (!wf) return false;
  await db.workflow.update({ where: { id }, data: { enabled, nextRunAt: enabled && wf.schedule ? nextRun(wf.schedule, new Date()) : wf.nextRunAt } });
  await audit(enabled ? "workflow_enabled" : "workflow_disabled", { userId, target: id });
  return true;
}

export async function deleteWorkflow(userId: string, id: string) {
  const res = await db.workflow.deleteMany({ where: { id, userId } });
  if (res.count) await audit("workflow_deleted", { userId, target: id });
  return res.count > 0;
}

/** Returns the token once. Only its hash is stored, so a leaked database can't trigger runs. */
export async function rotateWebhookToken(userId: string, id: string): Promise<string | null> {
  const wf = await ownedWorkflow(userId, id);
  if (!wf) return null;
  const token = `whk_${randomBytes(24).toString("base64url")}`;
  await db.workflow.update({ where: { id }, data: { webhookTokenHash: sha256(token) } });
  await audit("workflow_webhook_rotated", { userId, target: id });
  return token;
}

export async function workflowByWebhookToken(id: string, token: string) {
  if (!/^whk_[\w-]{20,}$/.test(token)) return null;
  return db.workflow.findFirst({ where: { id, webhookTokenHash: sha256(token) } });
}

type WorkflowRow = NonNullable<Awaited<ReturnType<typeof ownedWorkflow>>>;

/** Creates a run from the saved plan and launches it. New inputs (webhook) re-build template plans. */
export async function startWorkflowRun(wf: WorkflowRow, trigger: "manual" | "schedule" | "webhook", inputsOverride?: unknown): Promise<{ ok: boolean; runId?: string; error?: string }> {
  if (!wf.enabled && trigger !== "manual") return { ok: false, error: "Workflow is turned off" };
  let plan = planSchema.parse(wf.plan);
  let goal = { title: wf.title, criteria: wf.criteria };
  let workspace: Record<string, string> = {};
  const tpl = findTemplate(wf.template);
  if (tpl) {
    const built = instantiate(tpl.id, inputsOverride ?? wf.inputs);
    if (!built.ok) return { ok: false, error: built.errors.join(" ") };
    if (inputsOverride) ({ plan, goal } = built);
    workspace = built.workspace;
  }
  const g = await db.goal.create({ data: { userId: wf.userId, ...goal, priority: wf.priority, preference: wf.preference, budgetUsd: wf.budgetUsd } });
  const run = await db.run.create({ data: { userId: wf.userId, goalId: g.id, workflowId: wf.id, trigger, priority: wf.priority, budgetUsd: wf.budgetUsd }, select: { id: true } });
  await db.task.createMany({ data: plan.tasks.map((t) => ({ runId: run.id, ...t })) });
  if (Object.keys(workspace).length) {
    await db.workspaceEntry.createMany({ data: Object.entries(workspace).map(([key, value]) => ({ runId: run.id, key, value: value.slice(0, 20_000), authorKey: "user-input" })) });
  }
  await db.workflow.update({ where: { id: wf.id }, data: { lastRunAt: new Date() } });
  const launched = await launchRun(wf.userId, run.id);
  await audit("workflow_run", { userId: wf.userId, target: run.id, meta: { workflow: wf.id, trigger } });
  return launched.ok ? { ok: true, runId: run.id } : { ok: false, runId: run.id, error: launched.error };
}

/**
 * Cron entry point. Each due workflow is claimed by moving nextRunAt forward with a conditional
 * update first, so two overlapping cron calls can never start the same run twice.
 */
export async function runDueWorkflows(now = new Date()) {
  const due = await db.workflow.findMany({ where: { enabled: true, schedule: { not: null }, nextRunAt: { lte: now } }, take: 20, orderBy: { nextRunAt: "asc" } });
  const results: Array<{ workflowId: string; runId?: string; error?: string }> = [];
  for (const wf of due) {
    const claimed = await db.workflow.updateMany({ where: { id: wf.id, nextRunAt: wf.nextRunAt }, data: { nextRunAt: nextRun(wf.schedule!, now) } });
    if (claimed.count === 0) continue;
    const r = await startWorkflowRun(wf, "schedule");
    results.push({ workflowId: wf.id, runId: r.runId, error: r.error });
  }
  return results;
}

/** Called by the worker when a run completes: queue a delivery for approval, never send directly. */
export async function queueDeliveryIfNeeded(runId: string): Promise<boolean> {
  const run = await db.run.findUnique({ where: { id: runId }, include: { workflow: true, goal: true } });
  if (!run?.workflow?.deliveryUrl || run.status !== "completed" || !run.finalOutput) return false;
  if (await db.approval.count({ where: { runId, kind: "deliver" } })) return false;
  const req = planDelivery({ title: run.goal.title, output: run.finalOutput, url: run.workflow.deliveryUrl });
  await db.approval.create({ data: { runId, userId: run.userId, kind: req.kind, summary: req.summary, details: req.details } });
  await db.runEvent.create({ data: { runId, type: "approval", payload: { kind: "deliver", summary: req.summary } } });
  return true;
}
