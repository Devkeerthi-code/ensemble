import type { Metadata } from "next";
import Link from "next/link";
import { TEMPLATES } from "@/lib/automation/templates";
import { db } from "@/lib/server/db";
import { requireUser } from "@/lib/server/session";
import { requestOrigin } from "./origin";
import { scheduleText, utc } from "./format";

export const metadata: Metadata = { title: "Workflows" };

export default async function WorkflowsPage() {
  const user = await requireUser();
  const [workflows, origin] = await Promise.all([
    db.workflow.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: { id: true, name: true, title: true, schedule: true, nextRunAt: true, lastRunAt: true, enabled: true },
    }),
    requestOrigin(),
  ]);

  return (
    <div className="wrap app-main stack" style={{ gap: "var(--s6)" }}>
      <div className="sh" style={{ marginBottom: 0 }}>
        <div>
          <div className="eyebrow"><span className="mark">F</span>Workflows</div>
          <h1 style={{ fontSize: "var(--t-xl)" }}>Run the same goal again, on a schedule or from a webhook</h1>
          <p>A workflow is a saved plan with its own budget. Start one from a template below, or save any finished run as a workflow from its run page.</p>
        </div>
      </div>

      <section aria-labelledby="tpl-h" className="stack" style={{ gap: "var(--s3)" }}>
        <h2 id="tpl-h" className="label">Start from a template</h2>
        <div className="trio flush">
          {TEMPLATES.map((t) => (
            <Link key={t.id} href={`/workflows/new?template=${t.id}`}>
              <b>{t.name}</b>
              <p>{t.summary}</p>
              <span className="go" aria-hidden="true">Use this template</span>
            </Link>
          ))}
        </div>
      </section>

      <div className="wf-grid">
        <section className="panel" aria-labelledby="list-h">
          <div className="panel-h"><h2 id="list-h" style={{ fontSize: "var(--t-lg)" }}>Your workflows</h2><span className="xs muted">{workflows.length}</span></div>
          {workflows.length === 0 ? (
            <div className="empty">
              <svg viewBox="0 0 180 70" aria-hidden="true"><g stroke="var(--rule)">{[15, 25, 35, 45, 55].map((y) => <line key={y} x1="0" x2="180" y1={y} y2={y} />)}</g><rect x="80" y="25" width="20" height="6" fill="var(--ink)" /></svg>
              <b>No workflows yet</b>
              <p className="small muted" style={{ maxWidth: "44ch" }}>Pick a template above, or open a finished run in the Orchestrator and press &ldquo;Save as workflow&rdquo;.</p>
              <Link className="btn sm" href="/orchestrator">Go to your runs</Link>
            </div>
          ) : (
            <ul className="card-list">
              {workflows.map((w) => (
                <li key={w.id}>
                  <div className="stack" style={{ gap: "var(--s1)" }}>
                    <Link href={`/workflows/${w.id}`}><b>{w.name}</b></Link>
                    <p className="small muted">{w.title}</p>
                    <p className="meta-row">
                      <span className="st" data-s={w.enabled ? "on" : "off"}><i className="head" aria-hidden="true" />{w.enabled ? "On" : "Off"}</span>
                      <span>{scheduleText(w.schedule)}</span>
                      {w.schedule && w.enabled && <span>Next: {utc(w.nextRunAt)}</span>}
                      <span>Last run: {utc(w.lastRunAt)}</span>
                    </p>
                  </div>
                  <Link className="btn sm" href={`/workflows/${w.id}`}>Open</Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="stack">
          <div className="panel panel-b stack" style={{ gap: "var(--s2)" }}>
            <b>Save a run you liked</b>
            <p className="small muted">Any completed run can become a workflow. Open it from the Orchestrator and press &ldquo;Save as workflow&rdquo;. The plan you reviewed is reused exactly.</p>
          </div>
          <div className="panel" aria-labelledby="cron-h">
            <div className="panel-h"><h2 id="cron-h" className="label">How schedules run</h2></div>
            <div className="panel-b stack" style={{ gap: "var(--s3)" }}>
              <p className="small">A free <a href="https://cron-job.org" target="_blank" rel="noreferrer">cron-job.org</a> job calls this address every 5 minutes. Each call starts any workflow that is due.</p>
              <pre className="cmd">GET {origin}/api/cron{"\n"}Authorization: Bearer &lt;CRON_SECRET&gt;</pre>
              <p className="xs muted">CRON_SECRET lives only in the server&apos;s environment variables. It is never shown here. A workflow that is turned off is skipped.</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
