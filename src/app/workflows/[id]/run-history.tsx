import type { HistoryStats } from "@/lib/automation/history";

const W = 240;
const H = 48;

/** Cost per finished run as bars, oldest on the left. Failed runs are outlined instead of filled. */
function CostBars({ points }: { points: HistoryStats["points"] }) {
  const max = Math.max(...points.map((p) => p.costUsd), 1e-9);
  const slot = W / points.length;
  const bar = Math.max(2, Math.min(16, slot - 3));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-hidden="true" style={{ display: "block" }}>
      <line x1="0" y1={H - 0.5} x2={W} y2={H - 0.5} stroke="var(--rule)" />
      {points.map((p, i) => {
        const h = Math.max(2, (p.costUsd / max) * (H - 4));
        return (
          <rect key={i} x={i * slot + (slot - bar) / 2} y={H - h} width={bar} height={h} rx="1"
            fill={p.ok ? "var(--ink-2)" : "none"} stroke={p.ok ? "none" : "var(--accent)"} />
        );
      })}
    </svg>
  );
}

export function RunHistory({ stats }: { stats: HistoryStats }) {
  if (stats.finished === 0) return <p className="panel-b small muted">History appears here after the first run finishes.</p>;
  const pct = Math.round((stats.successRate ?? 0) * 100);
  const cost = (stats.avgCostUsd ?? 0).toFixed(3);
  const score = stats.avgQuality === null ? null : stats.avgQuality.toFixed(1);
  return (
    <div className="panel-b stack" style={{ gap: "var(--s3)" }}>
      <dl style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--s3)", margin: 0 }}>
        <div className="stat"><dt className="xs muted">Completed</dt><dd style={{ margin: 0 }}><b>{pct}%</b></dd></div>
        <div className="stat"><dt className="xs muted">Avg cost</dt><dd style={{ margin: 0 }}><b>${cost}</b></dd></div>
        <div className="stat"><dt className="xs muted">Avg score</dt><dd style={{ margin: 0 }}><b>{score ?? "–"}</b>{score && <span className="xs muted"> /10</span>}</dd></div>
      </dl>
      <figure style={{ margin: 0 }}>
        <CostBars points={stats.points} />
        <figcaption className="xs muted">Cost per run, oldest to newest, over {stats.finished} finished runs. Outlined bars failed.</figcaption>
      </figure>
    </div>
  );
}
