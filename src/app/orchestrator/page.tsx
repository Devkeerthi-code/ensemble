import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/server/db";
import { requireUser } from "@/lib/server/session";
import { credentialsFor } from "@/lib/server/orchestrator/keys";
import { RunStatus } from "@/components/run-status";
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
            <div className="stack" style={{ gap: "var(--s3)" }}><b>Add an AI provider first</b><p className="small muted">Ensemble needs at least one API key to plan and run goals. Groq and Gemini both have free tiers.</p><div><Link className="btn primary" href="/settings">Add a key</Link></div></div>
          ) : (
            <GoalForm maxBudget={maxBudget} />
          )}
        </div>
        <div className="panel">
          <div className="panel-h"><h2 className="label">Your runs</h2>{approvals > 0 && <Link className="small" href="/approvals" style={{ color: "var(--accent)", fontWeight: 600 }}>{approvals} waiting for your approval</Link>}</div>
          {runs.length === 0 ? (
            <div className="empty">
              <svg viewBox="0 0 180 70" aria-hidden="true"><g stroke="var(--rule)">{[15, 25, 35, 45, 55].map((y) => <line key={y} x1="0" x2="180" y1={y} y2={y} />)}</g><rect x="80" y="25" width="20" height="6" fill="var(--ink)" /></svg>
              <b>No runs yet</b>
              <p className="small muted" style={{ maxWidth: "46ch" }}>Write a goal on the left. Try: &ldquo;Compare three free note-taking apps for engineering students and write a one-page recommendation.&rdquo;</p>
            </div>
          ) : (
            <ul className="card-list">
              {runs.map((r) => (
                <li key={r.id}>
                  <div className="stack" style={{ gap: "var(--s1)" }}><Link href={`/orchestrator/runs/${r.id}`}><b>{r.goal.title}</b></Link><p className="meta-row"><RunStatus status={r.status} /><span>{r._count.tasks} tasks</span><span>${Number(r.spentUsd).toFixed(4)}</span><span>{r.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span></p></div>
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
