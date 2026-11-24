/** Summary of a workflow's recent runs, for the cost and quality history on its page. */
export type HistoryRun = { status: string; spentUsd: number; createdAt: Date; taskScores: Array<number | null> };
export type HistoryPoint = { at: Date; costUsd: number; quality: number | null; ok: boolean };
export type HistoryStats = {
  points: HistoryPoint[];
  finished: number;
  successRate: number | null;
  avgCostUsd: number | null;
  avgQuality: number | null;
};

const FINISHED = new Set(["completed", "failed", "cancelled"]);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Oldest-first points over finished runs. Quality is the mean judge score (0-10) of a run's scored tasks. */
export function runHistory(runs: HistoryRun[]): HistoryStats {
  const points = runs
    .filter((r) => FINISHED.has(r.status))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((r) => ({ at: r.createdAt, costUsd: r.spentUsd, quality: mean(r.taskScores.filter((s): s is number => s !== null)), ok: r.status === "completed" }));
  return {
    points,
    finished: points.length,
    successRate: points.length ? points.filter((p) => p.ok).length / points.length : null,
    avgCostUsd: mean(points.map((p) => p.costUsd)),
    avgQuality: mean(points.flatMap((p) => (p.quality === null ? [] : [p.quality]))),
  };
}
