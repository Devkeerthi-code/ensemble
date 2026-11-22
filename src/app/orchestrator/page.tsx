import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/server/db";
import { requireUser } from "@/lib/server/session";
import { credentialsFor } from "@/lib/server/orchestrator/keys";
import { GoalForm } from "./goal-form";

export const metadata: Metadata = { title: "Orchestrator" };

const maxBudget = Number(process.env.MAX_RUN_BUDGET_USD ?? 5);

export default async function OrchestratorPage() {
  const user = await requireUser();
  const [runs, approvals, creds] = await Promise.all([
    db.run.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, status: true, spentUsd: true, createdAt: true, goal: { select: { title: true } }, _count: { select: { tasks: true } } } }),
    db.approval.count({ where: { userId: user.id, status: "pending" } }),
    credentialsFor(user.id),
  ]);
  const providers = Object.keys(creds);

  return (
    <div className="wrap app-main">
      <div className="sh">
        <div>
          <div className="eyebrow"><span className="mark">E</span>Orchestrator</div>
          <h1 style={{ fontSize: "var(--t-xl)" }}>Give a team of AI agents a goal</h1>
          <p>A planner splits it into tasks, you review the plan, then several models work through it in parallel. A judge checks every result. You set the budget; nothing goes over it.</p>
        </div>
        <Link className="btn sm" href="/settings">Provider keys ({providers.length})</Link>
      </div>
      <div className="orch">
        <div className="panel panel-b" style={{ alignSelf: "start" }}>
          {providers.length === 0 ? (
            <div className="stack"><b>Add an AI provider first</b><p className="small muted">Ensemble needs at least one key (Groq and Gemini have free tiers).</p><Link className="btn primary" href="/settings">Add a key</Link></div>
          ) : (
            <GoalForm maxBudget={maxBudget} />
          )}
        </div>
        <div className="panel">
          <div className="panel-h"><b>Your runs</b>{approvals > 0 && <span className="small" style={{ color: "var(--accent)", fontWeight: 600 }}>{approvals} waiting for your approval</span>}</div>
          {runs.length === 0 ? (
            <div className="empty">
              <svg viewBox="0 0 180 70" aria-hidden="true"><g stroke="var(--rule)">{[15, 25, 35, 45, 55].map((y) => <line key={y} x1="0" x2="180" y1={y} y2={y} />)}</g><rect x="80" y="25" width="20" height="6" fill="var(--ink)" /></svg>
              <b>No runs yet</b>
              <p className="small muted">Try: &ldquo;Compare three free note-taking apps for engineering students and write a one-page recommendation.&rdquo;</p>
            </div>
          ) : (
            <ul className="card-list">
              {runs.map((r) => (
                <li key={r.id}>
                  <div><Link href={`/orchestrator/runs/${r.id}`}><b>{r.goal.title}</b></Link><p className="xs muted">{r.status} · {r._count.tasks} tasks · ${Number(r.spentUsd).toFixed(4)} · {r.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</p></div>
                  <Link className="btn sm" href={`/orchestrator/runs/${r.id}`}>{r.status === "draft" ? "Review plan" : "Open"}</Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
