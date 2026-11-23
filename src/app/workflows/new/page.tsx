import type { Metadata } from "next";
import Link from "next/link";
import { findTemplate, TEMPLATES } from "@/lib/automation/templates";
import { requireUser } from "@/lib/server/session";
import { GraphLegend, TaskGraph } from "@/components/task-graph";
import { NewWorkflowForm } from "./new-workflow-form";

export const metadata: Metadata = { title: "New workflow" };

const maxBudget = Number(process.env.MAX_RUN_BUDGET_USD ?? 5);

export default async function NewWorkflowPage({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  await requireUser();
  const { template } = await searchParams;
  const tpl = findTemplate(template);
  const preview = tpl ? tpl.plan(blankInputs(tpl.inputs)).tasks : [];

  return (
    <div className="wrap app-main">
      <div className="sh">
        <div>
          <div className="eyebrow"><span className="mark">F</span><Link href="/workflows">Workflows</Link> · New</div>
          <h1 style={{ fontSize: "var(--t-xl)" }}>{tpl ? tpl.name : "Pick a template"}</h1>
          <p>{tpl ? tpl.summary : "Each template comes with a reviewed plan. You fill in a few details and choose when it runs."}</p>
        </div>
        {tpl && <Link className="btn sm ghost" href="/workflows/new">Change template</Link>}
      </div>

      {!tpl ? (
        <div className="trio flush">
          {TEMPLATES.map((t) => (
            <Link key={t.id} href={`/workflows/new?template=${t.id}`}>
              <b>{t.name}</b>
              <p>{t.summary}</p>
              <span className="go" aria-hidden="true">Use this template</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="wf-grid">
          <div className="panel panel-b">
            <NewWorkflowForm templateId={tpl.id} templateName={tpl.name} inputs={tpl.inputs} maxBudget={maxBudget} />
          </div>
          <aside className="panel" aria-labelledby="plan-h">
            <div className="panel-h"><h2 id="plan-h" className="label">The plan it runs</h2><span className="xs muted">{preview.length} tasks</span></div>
            <div style={{ overflowX: "auto" }}><TaskGraph tasks={preview} /></div>
            <GraphLegend />
            <p className="panel-b xs muted" style={{ borderTop: "1px solid var(--rule)" }}>Tasks in the same column run in parallel on different models. A judge scores each result before the next step uses it.</p>
          </aside>
        </div>
      )}
    </div>
  );
}

/** The plan's shape doesn't depend on the inputs, so blank values are enough for a preview. */
function blankInputs(inputs: { name: string }[]) {
  return Object.fromEntries(inputs.map((i) => [i.name, ""]));
}
