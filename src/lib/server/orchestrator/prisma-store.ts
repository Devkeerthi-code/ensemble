import type { Prisma } from "@/generated/prisma/client";
import type { Provider } from "@/lib/orchestrator/catalog";
import type { MeasuredScore } from "@/lib/orchestrator/routing";
import type { MessageInput, RunPatch, RunSnapshot, RunStore, TaskPatch } from "@/lib/orchestrator/store";
import { db } from "../db";
import { credentialsFor } from "./keys";

export const KILL_SWITCH_KEY = "kill_switch";
const today = () => new Date(new Date().toISOString().slice(0, 10));
const num = (d: Prisma.Decimal | number | null | undefined) => (d == null ? 0 : Number(d));

/** Postgres implementation of the engine's store. Every write is scoped to a run id the engine was given. */
export const prismaStore: RunStore = {
  async loadRun(runId) {
    const run = await db.run.findUnique({ where: { id: runId }, include: { goal: true, tasks: { orderBy: { key: "asc" } } } });
    if (!run) return null;
    const snapshot: RunSnapshot = {
      id: run.id,
      userId: run.userId,
      status: run.status,
      priority: run.priority,
      preference: run.goal.preference,
      budgetUsd: num(run.budgetUsd),
      spentUsd: num(run.spentUsd),
      createdAt: run.createdAt,
      startedAt: run.startedAt,
      finalOutput: run.finalOutput,
      goal: { title: run.goal.title, criteria: run.goal.criteria },
      tasks: run.tasks.map((t) => ({ ...t, costUsd: num(t.costUsd) })),
    };
    return snapshot;
  },

  async updateTask(runId, key, patch: TaskPatch) {
    const { costUsd, ...rest } = patch;
    await db.task.update({ where: { runId_key: { runId, key } }, data: { ...rest, ...(costUsd !== undefined ? { costUsd } : {}) } as Prisma.TaskUpdateInput });
  },

  async updateRun(runId, patch: RunPatch) {
    const { report, ...rest } = patch;
    await db.run.update({ where: { id: runId }, data: { ...rest, ...(report !== undefined ? { report: report as Prisma.InputJsonValue } : {}) } });
  },

  async addSpend(runId, userId, usd) {
    if (usd <= 0) return;
    const day = today();
    await db.$transaction([
      db.run.update({ where: { id: runId }, data: { spentUsd: { increment: usd } } }),
      db.dailySpend.upsert({ where: { userId_day: { userId, day } }, create: { userId, day, spentUsd: usd }, update: { spentUsd: { increment: usd } } }),
    ]);
  },

  async daySpent(userId) {
    const row = await db.dailySpend.findUnique({ where: { userId_day: { userId, day: today() } } });
    return num(row?.spentUsd);
  },

  async killSwitch() {
    const row = await db.systemSetting.findUnique({ where: { key: KILL_SWITCH_KEY } });
    return row?.value === "on";
  },

  async event(runId, type, payload) {
    await db.runEvent.create({ data: { runId, type, payload: payload as Prisma.InputJsonValue } });
  },

  async message(runId, m: MessageInput) {
    await db.agentMessage.create({ data: { runId, fromKey: m.fromKey.slice(0, 40), toKey: m.toKey?.slice(0, 40), kind: m.kind, body: m.body.slice(0, 4000) } });
    await db.runEvent.create({ data: { runId, type: "message", payload: { from: m.fromKey, to: m.toKey ?? null, kind: m.kind } } });
  },

  async workspaceGet(runId, key) {
    return (await db.workspaceEntry.findUnique({ where: { runId_key: { runId, key } } }))?.value ?? null;
  },

  async workspaceSet(runId, key, value, authorKey) {
    await db.workspaceEntry.upsert({ where: { runId_key: { runId, key } }, create: { runId, key, value, authorKey }, update: { value, authorKey } });
  },

  async workspaceList(runId) {
    return db.workspaceEntry.findMany({ where: { runId }, select: { key: true, authorKey: true }, orderBy: { key: "asc" } });
  },

  async approvalState(runId, taskKey) {
    const task = await db.task.findUnique({ where: { runId_key: { runId, key: taskKey } }, select: { id: true } });
    if (!task) return null;
    const a = await db.approval.findFirst({ where: { runId, taskId: task.id }, orderBy: { createdAt: "desc" }, select: { status: true } });
    return a?.status ?? null;
  },

  async createApproval({ runId, userId, taskKey, kind, summary, details }) {
    const task = await db.task.findUnique({ where: { runId_key: { runId, key: taskKey } }, select: { id: true } });
    await db.approval.create({ data: { runId, userId, taskId: task?.id, kind, summary, details: details as Prisma.InputJsonValue } });
    await db.runEvent.create({ data: { runId, type: "approval", payload: { key: taskKey, kind, summary } } });
  },

  async scores() {
    return (await db.modelScore.findMany()) as MeasuredScore[];
  },

  async saveScore(s) {
    const data = { samples: s.samples, quality: s.quality, latencyMs: s.latencyMs, costUsd: s.costUsd };
    await db.modelScore.upsert({
      where: { provider_model_skill: { provider: s.provider as Provider, model: s.model, skill: s.skill } },
      create: { provider: s.provider as Provider, model: s.model, skill: s.skill, ...data },
      update: data,
    });
  },

  credentials: credentialsFor,
};
