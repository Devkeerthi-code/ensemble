import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { PlanTask } from "@/lib/orchestrator/dag";
import { requireUser } from "@/lib/server/session";
import { runSnapshot } from "@/lib/server/orchestrator/snapshot";
import { LiveRun } from "./live-run";
import { PlanEditor } from "./plan-editor";

export const metadata: Metadata = { title: "Run" };

export default async function RunPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ planError?: string }> }) {
  const user = await requireUser();
  const [{ id }, { planError }] = await Promise.all([params, searchParams]);
  const run = await runSnapshot(user.id, id);
  if (!run) notFound();
  const plan: PlanTask[] = run.tasks.map(({ key, title, skill, instructions, acceptance, dependsOn, important }) => ({ key, title, skill, instructions, acceptance, dependsOn, important }));

  return (
    <div className="wrap app-main">
      <div className="sh">
        <div>
          <div className="eyebrow"><span className="mark">E</span><Link href="/orchestrator">Orchestrator</Link> · {run.priority} priority · {run.goal.preference}</div>
          <h1 style={{ fontSize: "var(--t-xl)" }}>{run.goal.title}</h1>
          <p>Done when: {run.goal.criteria}</p>
        </div>
      </div>
      {run.status === "draft" ? <PlanEditor runId={run.id} initial={plan} planError={planError} budgetUsd={run.budgetUsd} /> : <LiveRun initial={run} />}
    </div>
  );
}
