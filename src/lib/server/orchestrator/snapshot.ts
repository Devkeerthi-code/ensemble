import { findModel } from "@/lib/orchestrator/catalog";
import { db } from "../db";

/** What the browser is allowed to see about a run. Never includes keys; outputs only for this user's own run. */
export async function runSnapshot(userId: string, runId: string) {
  const run = await db.run.findFirst({
    where: { id: runId, userId },
    include: {
      goal: { select: { title: true, criteria: true, preference: true } },
      tasks: { orderBy: { key: "asc" } },
      messages: { orderBy: { createdAt: "desc" }, take: 60 },
      approvals: { where: { status: "pending" }, select: { id: true, taskId: true, kind: true, summary: true, createdAt: true } },
    },
  });
  if (!run) return null;
  return {
    id: run.id,
    status: run.status,
    priority: run.priority,
    goal: run.goal,
    budgetUsd: Number(run.budgetUsd),
    spentUsd: Number(run.spentUsd),
    error: run.error,
    finalOutput: run.finalOutput,
    report: run.report,
    startedAt: run.startedAt?.toISOString() ?? null,
    finishedAt: run.finishedAt?.toISOString() ?? null,
    tasks: run.tasks.map((t) => ({
      key: t.key, title: t.title, skill: t.skill, instructions: t.instructions, acceptance: t.acceptance, dependsOn: t.dependsOn, important: t.important,
      status: t.status, attempts: t.attempts, provider: t.provider, model: t.model,
      modelLabel: t.provider && t.model ? (findModel(t.provider, t.model)?.label ?? t.model) : null,
      routeReason: t.routeReason, score: t.score, judgeNotes: t.judgeNotes, error: t.error, output: t.output,
      tokens: t.inputTokens + t.outputTokens, costUsd: Number(t.costUsd), latencyMs: t.latencyMs,
    })),
    messages: run.messages.reverse().map((m) => ({ id: m.id, from: m.fromKey, to: m.toKey, kind: m.kind, body: m.body, at: m.createdAt.toISOString() })),
    approvals: run.approvals.map((a) => ({ ...a, taskKey: run.tasks.find((t) => t.id === a.taskId)?.key ?? null, createdAt: a.createdAt.toISOString() })),
  };
}

export type RunView = NonNullable<Awaited<ReturnType<typeof runSnapshot>>>;
export type TaskView = RunView["tasks"][number];
