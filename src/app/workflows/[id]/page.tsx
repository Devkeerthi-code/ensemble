import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { runHistory } from "@/lib/automation/history";
import { findTemplate } from "@/lib/automation/templates";
import { planSchema } from "@/lib/orchestrator/dag";
import { db } from "@/lib/server/db";
import { requireUser } from "@/lib/server/session";
import { GraphLegend, TaskGraph } from "@/components/task-graph";
import { RunStatus } from "@/components/run-status";
import { requestOrigin } from "../origin";
import { scheduleText, TRIGGER, utc } from "../format";
import { RunHistory } from "./run-history";
import { DeleteWorkflow, WebhookPanel, WorkflowControls, WorkflowSettingsForm } from "./workflow-client";

export const metadata: Metadata = { title: "Workflow" };

const maxBudget = Number(process.env.MAX_RUN_BUDGET_USD ?? 5);

export default async function WorkflowPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const wf = await db.workflow.findFirst({ where: { id, userId: user.id } });
  if (!wf) notFound();
  const [runs, waiting, origin] = await Promise.all([
    db.run.findMany({ where: { workflowId: wf.id, userId: user.id }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, status: true, trigger: true, spentUsd: true, createdAt: true, tasks: { select: { score: true } } } }),
    db.approval.count({ where: { userId: user.id, status: "pending", run: { workflowId: wf.id } } }),
    requestOrigin(),
  ]);
  const plan = planSchema.safeParse(wf.plan);
  const history = runHistory(runs.map((r) => ({ status: r.status, spentUsd: Number(r.spentUsd), createdAt: r.createdAt, taskScores: r.tasks.map((t) => t.score) })));
  const recent = runs.slice(0, 15);
  const tpl = findTemplate(wf.template);

  return (
    <div className="wrap app-main stack">
      <div className="sh" style={{ marginBottom: 0 }}>
        <div>
          <div className="eyebrow"><span className="mark">F</span><Link href="/workflows">Workflows</Link> · {tpl ? tpl.name : "Saved from a run"}</div>
          <h1 style={{ fontSize: "var(--t-xl)" }}>{wf.name}</h1>
          <p><b>Goal:</b> {wf.title}</p>
          <p className="small">Done when: {wf.criteria}</p>
          <p className="meta-row" style={{ marginTop: "var(--s3)" }}>
            <span>{scheduleText(wf.schedule)}</span>
            {wf.schedule && wf.enabled && <span>Next: {utc(wf.nextRunAt)}</span>}
            <span>Last run: {utc(wf.lastRunAt)}</span>
            <span>Budget ${Number(wf.budgetUsd).toFixed(2)} per run</span>
          </p>
        </div>
        <WorkflowControls workflowId={wf.id} enabled={wf.enabled} />
      </div>

      {waiting > 0 && (
        <Link href="/approvals" className="panel panel-b small" style={{ borderColor: "var(--accent)", textDecoration: "none" }}>
          <b style={{ color: "var(--accent)" }}>{waiting} waiting for your approval.</b> Open Approvals to send or drop it.
        </Link>
      )}

      <section className="panel" aria-labelledby="plan-h">
        <div className="panel-h"><h2 id="plan-h" className="label">The plan each run follows</h2><span className="xs muted">{plan.success ? `${plan.data.tasks.length} tasks` : ""}</span></div>
        {plan.success ? (
          <>
            <div style={{ overflowX: "auto" }}><TaskGraph tasks={plan.data.tasks} /></div>
            <GraphLegend />
          </>
        ) : (
          <div className="errbox"><b>This saved plan can&apos;t be read</b><p className="small">Delete the workflow and save it again from a run.</p></div>
        )}
      </section>

      <div className="wf-cols">
        <section className="panel" aria-labelledby="set-h">
          <div className="panel-h"><h2 id="set-h" className="label">Settings</h2></div>
          <div className="panel-b">
            <WorkflowSettingsForm
              workflowId={wf.id}
              maxBudget={maxBudget}
              defaults={{ name: wf.name, budgetUsd: Number(wf.budgetUsd), priority: wf.priority, preference: wf.preference, schedule: wf.schedule, deliveryUrl: wf.deliveryUrl }}
            />
          </div>
        </section>

        <div className="stack">
          <section className="panel" aria-labelledby="runs-h">
            <div className="panel-h"><h2 id="runs-h" className="label">Recent runs</h2><span className="xs muted">{recent.length}</span></div>
            {recent.length === 0 ? (
              <p className="panel-b small muted">No runs yet. Press &ldquo;Run now&rdquo; to try it, or wait for the schedule.</p>
            ) : (
              <ul className="card-list">
                {recent.map((r) => (
                  <li key={r.id}>
                    <div className="stack" style={{ gap: "var(--s1)" }}>
                      <RunStatus status={r.status} />
                      <p className="meta-row"><span>{TRIGGER[r.trigger] ?? r.trigger}</span><span>{utc(r.createdAt)}</span><span>${Number(r.spentUsd).toFixed(4)}</span></p>
                    </div>
                    <Link className="btn sm" href={`/orchestrator/runs/${r.id}`}>Open</Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel" aria-labelledby="hist-h">
            <div className="panel-h"><h2 id="hist-h" className="label">History</h2></div>
            <RunHistory stats={history} />
          </section>

          <section className="panel" aria-labelledby="hook-h">
            <div className="panel-h"><h2 id="hook-h" className="label">Webhook trigger</h2></div>
            <WebhookPanel workflowId={wf.id} hasToken={Boolean(wf.webhookTokenHash)} origin={origin} inputNames={tpl ? tpl.inputs.map((i) => i.name) : []} />
          </section>

          <DeleteWorkflow workflowId={wf.id} name={wf.name} />
        </div>
      </div>
    </div>
  );
}
