import { findModel } from "./catalog";
import type { RunSnapshot } from "./store";

export type RunReport = {
  rows: Array<{ key: string; title: string; skill: string; status: string; model: string; score: number | null; attempts: number; tokens: number; costUsd: number; seconds: number | null }>;
  totals: { tasks: number; done: number; costUsd: number; tokens: number; wallSeconds: number | null; models: number };
};

/** Deterministic, so the "who did what" report costs nothing and can't be hallucinated. */
export function assembleReport(run: RunSnapshot): { finalOutput: string; report: RunReport } {
  const sinks = run.tasks.filter((t) => !run.tasks.some((o) => o.dependsOn.includes(t.key)));
  const finalOutput = sinks
    .filter((t) => t.output)
    .map((t) => (sinks.length > 1 ? `## ${t.title}\n\n${t.output}` : t.output!))
    .join("\n\n");
  const rows = run.tasks.map((t) => ({
    key: t.key,
    title: t.title,
    skill: t.skill,
    status: t.status,
    model: t.provider && t.model ? (findModel(t.provider, t.model)?.label ?? t.model) : "—",
    score: t.score ?? null,
    attempts: t.attempts,
    tokens: t.inputTokens + t.outputTokens,
    costUsd: Number(t.costUsd),
    seconds: t.latencyMs ? Math.round(t.latencyMs / 100) / 10 : null,
  }));
  const ends = run.tasks.map((t) => t.finishedAt?.getTime() ?? 0).filter(Boolean);
  return {
    finalOutput,
    report: {
      rows,
      totals: {
        tasks: rows.length,
        done: rows.filter((r) => r.status === "done").length,
        costUsd: Number(run.spentUsd),
        tokens: rows.reduce((n, r) => n + r.tokens, 0),
        wallSeconds: run.startedAt && ends.length ? Math.round((Math.max(...ends) - run.startedAt.getTime()) / 100) / 10 : null,
        models: new Set(rows.map((r) => r.model).filter((m) => m !== "—")).size,
      },
    },
  };
}
