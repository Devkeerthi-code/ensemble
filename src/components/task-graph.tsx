"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { depths, findCycle } from "@/lib/orchestrator/dag";

export type GraphTask = { key: string; title: string; skill: string; dependsOn: string[]; status?: string };
type Props = {
  tasks: GraphTask[];
  selected?: string | null;
  onSelect?: (key: string) => void;
  /** Alt+Arrow Up/Down on a node; given only where the plan is editable. */
  onMove?: (key: string, dir: -1 | 1) => void;
  live?: boolean;
};

const NODE_W = 156;
const NODE_H = 64;
const COL_GAP = 64;
const ROW_GAP = 20;
const PAD = 16;

const STATUS_LABEL: Record<string, string> = {
  pending: "waiting", queued: "queued", running: "running", waiting_approval: "needs approval", done: "done", failed: "failed", cancelled: "cancelled",
};
const DATA_STATUS: Record<string, string> = { waiting_approval: "waiting", running: "running", done: "done", failed: "failed", cancelled: "cancelled" };

function layout(tasks: GraphTask[]) {
  const safe = findCycle(tasks) ? tasks.map((t) => ({ ...t, dependsOn: [] })) : tasks;
  const valid = safe.filter((t) => t.dependsOn.every((d) => safe.some((x) => x.key === d)));
  const depth = depths(valid.length === safe.length ? safe : safe.map((t) => ({ ...t, dependsOn: [] })));
  const cols = new Map<number, string[]>();
  for (const t of tasks) {
    const d = depth.get(t.key) ?? 0;
    cols.set(d, [...(cols.get(d) ?? []), t.key]);
  }
  const pos = new Map<string, { x: number; y: number }>();
  for (const [d, keys] of cols) keys.forEach((k, i) => pos.set(k, { x: PAD + d * (NODE_W + COL_GAP), y: PAD + i * (NODE_H + ROW_GAP) }));
  const width = PAD * 2 + Math.max(1, cols.size) * (NODE_W + COL_GAP) - COL_GAP;
  const height = PAD * 2 + Math.max(...[...cols.values()].map((c) => c.length), 1) * (NODE_H + ROW_GAP) - ROW_GAP;
  return { pos, width, height };
}

/** Spring-loaded nodes (k=520, d=26 as in the design concept): drag to inspect the wiring, release and it settles home. */
function useSpring() {
  const [offsets, setOffsets] = useState<Record<string, { x: number; y: number }>>({});
  const state = useRef(new Map<string, { x: number; y: number; vx: number; vy: number; held: boolean }>());
  const frame = useRef<number | null>(null);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, []);

  function animate() {
    let moving = false;
    const dt = 1 / 60;
    for (const s of state.current.values()) {
      if (s.held) continue;
      s.vx += (-520 * s.x - 26 * s.vx) * dt;
      s.vy += (-520 * s.y - 26 * s.vy) * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (Math.abs(s.x) + Math.abs(s.y) + Math.abs(s.vx) + Math.abs(s.vy) > 0.2) moving = true;
      else s.x = s.y = s.vx = s.vy = 0;
    }
    setOffsets(Object.fromEntries([...state.current].map(([k, s]) => [k, { x: s.x, y: s.y }])));
    frame.current = moving ? requestAnimationFrame(animate) : null;
  }

  return {
    offsets,
    hold(key: string, x: number, y: number) {
      state.current.set(key, { x, y, vx: 0, vy: 0, held: true });
      setOffsets((o) => ({ ...o, [key]: { x, y } }));
    },
    release(key: string) {
      const s = state.current.get(key);
      if (!s) return;
      s.held = false;
      if (reduced.current) {
        state.current.delete(key);
        setOffsets((o) => ({ ...o, [key]: { x: 0, y: 0 } }));
        return;
      }
      frame.current ??= requestAnimationFrame(animate);
    },
  };
}

export function TaskGraph({ tasks, selected, onSelect, onMove, live }: Props) {
  const { pos, width, height } = useMemo(() => layout(tasks), [tasks]);
  const spring = useSpring();
  const drag = useRef<{ key: string; sx: number; sy: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const at = (k: string) => {
    const p = pos.get(k) ?? { x: 0, y: 0 };
    const o = spring.offsets[k] ?? { x: 0, y: 0 };
    return { x: p.x + o.x, y: p.y + o.y };
  };

  return (
    <div className="dag" style={{ height, minWidth: "100%" }}>
      <div style={{ position: "relative", width, height }}>
        <svg width={width} height={height} aria-hidden="true">
          {tasks.flatMap((t) =>
            t.dependsOn.filter((d) => pos.has(d)).map((d) => {
              const a = at(d);
              const b = at(t.key);
              const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2, x2 = b.x, y2 = b.y + NODE_H / 2;
              const from = tasks.find((x) => x.key === d);
              const cls = t.status === "running" ? "edge live" : from?.status === "done" ? "edge done" : "edge";
              return <path key={`${d}-${t.key}`} className={cls} d={`M${x1},${y1} C${x1 + COL_GAP / 2},${y1} ${x2 - COL_GAP / 2},${y2} ${x2},${y2}`} />;
            }),
          )}
        </svg>
        {tasks.map((t) => {
          const p = at(t.key);
          return (
            <button
              key={t.key}
              type="button"
              className={`node${selected === t.key ? " sel" : ""}${dragging === t.key ? " drag" : ""}`}
              data-s={DATA_STATUS[t.status ?? ""] ?? undefined}
              style={{ transform: `translate(${p.x}px, ${p.y}px)`, height: NODE_H }}
              aria-label={`${t.title}, ${t.skill}${t.status ? `, ${STATUS_LABEL[t.status] ?? t.status}` : ""}`}
              aria-pressed={selected === t.key}
              onClick={() => { if (!drag.current?.moved) onSelect?.(t.key); }}
              onKeyDown={(e) => {
                if (!onMove || !e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
                e.preventDefault();
                onSelect?.(t.key);
                onMove(t.key, e.key === "ArrowUp" ? -1 : 1);
              }}
              aria-keyshortcuts={onMove ? "Alt+ArrowUp Alt+ArrowDown" : undefined}
              onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { key: t.key, sx: e.clientX, sy: e.clientY, moved: false }; }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d || d.key !== t.key) return;
                const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
                if (!d.moved && Math.abs(dx) + Math.abs(dy) > 4) {
                  d.moved = true;
                  setDragging(t.key);
                }
                if (d.moved) spring.hold(t.key, dx, dy);
              }}
              onPointerUp={() => { spring.release(t.key); setDragging(null); setTimeout(() => { drag.current = null; }, 0); }}
            >
              <span className="head" aria-hidden="true" />
              <span className="t">{t.title}</span>
              <span className="sk">{t.skill}{live && t.status ? ` · ${STATUS_LABEL[t.status] ?? t.status}` : ""}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function GraphLegend() {
  return (
    <div className="legend" aria-label="Legend">
      <span><i className="head" />queued</span>
      <span><i className="head" style={{ background: "linear-gradient(90deg,var(--accent) 50%,transparent 50%)", borderColor: "var(--accent)" }} />running</span>
      <span><i className="head" style={{ background: "var(--ink)" }} />done</span>
      <span><i className="head" style={{ borderStyle: "dashed", borderColor: "var(--accent)" }} />needs approval</span>
      <span><i className="head" style={{ background: "var(--accent)", borderColor: "var(--accent)" }} />failed</span>
    </div>
  );
}
