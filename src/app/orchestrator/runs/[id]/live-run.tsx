"use client";

import { useEffect, useState, useTransition } from "react";
import type { RunView } from "@/lib/server/orchestrator/snapshot";
import type { RunReport } from "@/lib/orchestrator/report";
import { GraphLegend, TaskGraph } from "@/components/task-graph";
import { useToast } from "@/components/toast";
import { approvalAction, rerunAction, runControlAction } from "../../actions";

const money = (n: number) => `$${n.toFixed(n < 0.01 ? 4 : 3)}`;
const STATUS_TEXT: Record<string, string> = { queued: "Queued", running: "Running", paused: "Paused", completed: "Completed", failed: "Failed", cancelled: "Cancelled", draft: "Draft" };

function elapsed(from: string | null, to: string | null, now: number) {
  if (!from) return "0s";
  const s = Math.max(0, Math.round(((to ? Date.parse(to) : now) - Date.parse(from)) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function LiveRun({ initial }: { initial: RunView }) {
  const [run, setRun] = useState(initial);
  const [selected, setSelected] = useState<string | null>(initial.tasks.find((t) => t.status === "running")?.key ?? initial.tasks[0]?.key ?? null);
  const [connected, setConnected] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const live = ["running", "queued", "paused"].includes(run.status);

  useEffect(() => {
    if (!live) return;
    const es = new EventSource(`/api/runs/${run.id}/events`);
    es.addEventListener("snapshot", (e) => { setRun(JSON.parse((e as MessageEvent).data)); setConnected(true); });
    es.onerror = () => setConnected(false);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { es.close(); clearInterval(timer); };
  }, [run.id, live]);

  const task = run.tasks.find((t) => t.key === selected);
  const done = run.tasks.filter((t) => t.status === "done").length;
  const tokens = run.tasks.reduce((n, t) => n + t.tokens, 0);
  const report = run.report as RunReport | null;

  const control = (action: "pause" | "resume" | "cancel") => start(async () => {
    const res = await runControlAction(run.id, action);
    if (res.ok) {
      setRun((r) => ({ ...r, status: action === "pause" ? "paused" : action === "resume" ? "running" : "cancelled" }));
      toast(action === "pause" ? "Paused. Running tasks finish; nothing new starts." : action === "resume" ? "Resumed" : "Run cancelled");
    } else toast(res.error ?? "Couldn't do that", { bad: true });
  });
  const decide = (id: string, approve: boolean) => start(async () => {
    const res = await approvalAction(id, approve);
    toast(res.ok ? (approve ? "Approved. The step is back in the queue." : "Rejected. The step won't run.") : (res.error ?? "Failed"), { bad: !res.ok });
    if (res.ok) setRun((r) => ({ ...r, approvals: r.approvals.filter((a) => a.id !== id) }));
  });

  return (
    <div className="stack">
      <div className="panel">
        <div className="panel-h">
          <div className="runbar" aria-live="polite">
            <b>{STATUS_TEXT[run.status] ?? run.status}</b>
            {live && !connected && <span className="xs muted">Reconnecting…</span>}
            {run.error && <span className="small" style={{ color: "var(--accent)" }}>{run.error}</span>}
          </div>
          <div className="runbar">
            {run.status === "running" && <button className="btn sm" type="button" disabled={pending} onClick={() => control("pause")}>Pause</button>}
            {run.status === "paused" && <button className="btn sm primary" type="button" disabled={pending} onClick={() => control("resume")}>Resume</button>}
            {live && <button className="btn sm ghost" type="button" disabled={pending} onClick={() => control("cancel")}>Cancel</button>}
            <form action={rerunAction.bind(null, run.id)}><button className="btn sm" type="submit">Re-run as new draft</button></form>
          </div>
        </div>
        <div className="meters">
          <div><b>{done}/{run.tasks.length}</b><small>tasks done</small></div>
          <div><b>{money(run.spentUsd)}</b><small>of {money(run.budgetUsd)} budget</small></div>
          <div><b>{tokens.toLocaleString()}</b><small>tokens</small></div>
          <div><b>{elapsed(run.startedAt, run.finishedAt, now)}</b><small>elapsed</small></div>
        </div>
        <div className="budget" role="progressbar" aria-label="Budget used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((run.spentUsd / run.budgetUsd) * 100)}>
          <i style={{ width: `${Math.min(100, (run.spentUsd / run.budgetUsd) * 100)}%` }} />
        </div>
        <div style={{ overflowX: "auto" }}><TaskGraph tasks={run.tasks} selected={selected} onSelect={setSelected} live /></div>
        <GraphLegend />
      </div>

      {run.approvals.length > 0 && (
        <div className="panel" style={{ borderColor: "var(--accent)" }} aria-labelledby="appr-h">
          <div className="panel-h"><h2 id="appr-h" style={{ fontSize: "var(--t-lg)" }}>Waiting for you</h2><span className="xs muted">Nothing with real-world effect runs without your yes</span></div>
          {run.approvals.map((a) => (
            <div key={a.id} className="approval">
              <p className="small">{a.summary}</p>
              <div className="out">
                <button className="btn accent sm" type="button" disabled={pending} onClick={() => decide(a.id, true)}>Approve</button>
                <button className="btn sm" type="button" disabled={pending} onClick={() => decide(a.id, false)}>Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="run-grid">
        <div className="panel">
          <div className="panel-h"><b>{task?.title ?? "Pick a task"}</b>{task?.score != null && <span className="judge"><b>{task.score}</b><span className="xs muted">/10 judge</span></span>}</div>
          {task && (
            <div className="panel-b stack">
              <dl className="kv">
                <dt>Status</dt><dd>{task.status.replace("_", " ")}{task.attempts > 1 ? ` · attempt ${task.attempts}` : ""}</dd>
                <dt>Model</dt><dd>{task.modelLabel ?? "not chosen yet"}</dd>
                <dt>Tokens</dt><dd>{task.tokens.toLocaleString()}</dd>
                <dt>Cost</dt><dd>{money(task.costUsd)}</dd>
                <dt>Time</dt><dd>{task.latencyMs ? `${(task.latencyMs / 1000).toFixed(1)}s` : "—"}</dd>
              </dl>
              {task.routeReason && <div className="why-model"><b className="xs">Why this model</b><p className="small">{task.routeReason}</p></div>}
              {task.judgeNotes && <p className="small muted">Judge: {task.judgeNotes}</p>}
              {task.error && <p className="small" style={{ color: "var(--accent)" }}>{task.error}</p>}
            </div>
          )}
        </div>
        <div className="panel">
          <div className="panel-h"><b>Messages between agents</b><span className="xs muted">{run.messages.length}</span></div>
          {run.messages.length === 0 ? <p className="panel-b small muted">Hand-offs and questions between agents show up here.</p> : (
            <ul className="log">
              {run.messages.map((m) => (
                <li key={m.id}><span className={`tag${m.kind === "handoff" ? " hand" : ""}`}>{m.kind}</span><div><span className="from">{m.from}{m.to ? ` → ${m.to}` : ""}</span><p className="small">{m.body.slice(0, 400)}</p></div></li>
              ))}
            </ul>
          )}
        </div>
        <div className="panel">
          <div className="panel-h"><b>Output</b></div>
          <div className="panel-b">
            {task?.output ? <pre className="small" style={{ whiteSpace: "pre-wrap", margin: 0, fontFamily: "var(--font)", maxHeight: 360, overflow: "auto" }}>{task.output}</pre> : <p className="small muted">{task?.status === "running" ? "Working…" : "No output yet."}</p>}
          </div>
        </div>
      </div>

      {run.finalOutput && (
        <div className="panel">
          <div className="panel-h"><h2 style={{ fontSize: "var(--t-lg)" }}>Final result</h2><button className="btn sm" type="button" onClick={() => navigator.clipboard.writeText(run.finalOutput ?? "").then(() => toast("Copied"))}>Copy</button></div>
          <pre className="panel-b" style={{ whiteSpace: "pre-wrap", margin: 0, fontFamily: "var(--font)", fontSize: "var(--t-sm)" }}>{run.finalOutput}</pre>
        </div>
      )}
      {report && (
        <div className="panel" style={{ overflowX: "auto" }}>
          <div className="panel-h"><b>Who did what</b><span className="xs muted">{report.totals.models} models · {money(report.totals.costUsd)} · {report.totals.wallSeconds ?? "—"}s</span></div>
          <table className="small" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Task", "Skill", "Model", "Score", "Tries", "Tokens", "Cost"].map((h) => <th key={h} style={{ textAlign: "left", padding: "8px 16px", borderBottom: "1px solid var(--rule)" }}>{h}</th>)}</tr></thead>
            <tbody>{report.rows.map((r) => <tr key={r.key}>{[r.title, r.skill, r.model, r.score ?? "—", r.attempts, r.tokens, money(r.costUsd)].map((c, i) => <td key={i} style={{ padding: "8px 16px", borderBottom: "1px solid var(--rule)" }}>{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
