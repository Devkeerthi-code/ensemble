"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moveInColumn, SKILLS, validateDag, type PlanTask } from "@/lib/orchestrator/dag";
import { GraphLegend, TaskGraph } from "@/components/task-graph";
import { useToast } from "@/components/toast";
import { launchRunAction, savePlanAction } from "../../actions";

type Props = { runId: string; initial: PlanTask[]; planError?: string; budgetUsd: number };

const blankTask = (n: number): PlanTask => ({ key: `task-${n}`, title: "New task", skill: "research", instructions: "Describe what this agent should do.", acceptance: "What a good result looks like.", dependsOn: [], important: false });

export function PlanEditor({ runId, initial, planError, budgetUsd }: Props) {
  const [tasks, setTasks] = useState<PlanTask[]>(initial.length ? initial : [blankTask(1)]);
  const [selected, setSelected] = useState<string | null>(tasks[0]?.key ?? null);
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const dagErrors = useMemo(() => validateDag(tasks), [tasks]);
  const current = tasks.find((t) => t.key === selected);

  const update = (key: string, patch: Partial<PlanTask>) => {
    setTasks((all) => all.map((t) => (t.key === key ? { ...t, ...patch } : patch.key && t.dependsOn.includes(key) ? { ...t, dependsOn: t.dependsOn.map((d) => (d === key ? patch.key! : d)) } : t)));
    if (patch.key) setSelected(patch.key);
  };
  const remove = (key: string) => {
    setTasks((all) => all.filter((t) => t.key !== key).map((t) => ({ ...t, dependsOn: t.dependsOn.filter((d) => d !== key) })));
    setSelected(null);
  };
  const move = (key: string, dir: -1 | 1) => setTasks((all) => moveInColumn(all, key, dir));
  const add = () => {
    let n = tasks.length + 1;
    while (tasks.some((t) => t.key === `task-${n}`)) n++;
    setTasks((all) => [...all, blankTask(n)]);
    setSelected(`task-${n}`);
  };

  function act(kind: "save" | "run") {
    start(async () => {
      const res = kind === "save" ? await savePlanAction(runId, { tasks }) : await launchRunAction(runId, { tasks });
      if (res.ok) {
        setServerErrors([]);
        toast(kind === "save" ? "Plan saved" : "Run started. The worker picks it up within a second or two.");
        router.refresh();
      } else {
        setServerErrors(res.errors ?? [res.error ?? "Something went wrong"]);
        toast(res.error ?? "Fix the problems in the plan first", { bad: true });
      }
    });
  }

  return (
    <div className="stack">
      {planError && <div className="panel errbox" role="alert"><b>The planner couldn&apos;t make a plan</b><p className="small">{planError}</p></div>}
      <div className="panel">
        <div className="panel-h">
          <div><h2 className="label">Review the plan</h2><p className="xs muted">{tasks.length} tasks · budget ${budgetUsd.toFixed(2)} · nothing runs until you press Run</p></div>
          <div className="out">
            <button className="btn sm" type="button" onClick={add}>Add task</button>
            <button className="btn sm" type="button" onClick={() => act("save")} disabled={pending}>Save draft</button>
            <button className="btn accent" type="button" onClick={() => act("run")} disabled={pending || dagErrors.length > 0}>{pending ? "Starting…" : "Run plan"}</button>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}><TaskGraph tasks={tasks} selected={selected} onSelect={setSelected} onMove={move} /></div>
        <GraphLegend />
        <p className="xs muted" style={{ padding: "0 var(--s4) var(--s3)" }}>Keyboard: Tab to a task, Enter to edit it, Alt+↑ or Alt+↓ to move it within its column.</p>
      </div>

      {(dagErrors.length > 0 || serverErrors.length > 0) && (
        <ul className="panel panel-b form-error" role="alert" style={{ margin: 0, paddingLeft: "var(--s7)", display: "grid", gap: "var(--s1)" }}>
          {[...dagErrors.map((e) => e.message), ...serverErrors].map((m) => <li key={m}>{m}</li>)}
        </ul>
      )}

      {current && (
        <div className="panel panel-b stack" aria-label={`Edit ${current.title}`}>
          <div className="two">
            <div className="field"><label htmlFor="t-title">Task</label><input id="t-title" className="input" value={current.title} maxLength={200} onChange={(e) => update(current.key, { title: e.target.value })} /></div>
            <div className="field">
              <label htmlFor="t-skill">Skill needed</label>
              <select id="t-skill" className="input" value={current.skill} onChange={(e) => update(current.key, { skill: e.target.value as PlanTask["skill"] })}>
                {SKILLS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="field"><label htmlFor="t-key">Short id</label><input id="t-key" className="input" value={current.key} onChange={(e) => update(current.key, { key: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40) })} /></div>
          <div className="field"><label htmlFor="t-ins">Instructions for the agent</label><textarea id="t-ins" rows={4} value={current.instructions} onChange={(e) => update(current.key, { instructions: e.target.value })} style={{ fontFamily: "var(--font)", fontSize: "var(--t-sm)" }} /></div>
          <div className="field"><label htmlFor="t-acc">Acceptance criteria (the judge scores against this)</label><textarea id="t-acc" rows={2} value={current.acceptance} onChange={(e) => update(current.key, { acceptance: e.target.value })} style={{ fontFamily: "var(--font)", fontSize: "var(--t-sm)" }} /></div>
          <fieldset className="plain">
            <legend className="label">Waits for</legend>
            <div className="chips">
              {tasks.filter((t) => t.key !== current.key).map((t) => (
                <label className="chip" key={t.key}><input type="checkbox" checked={current.dependsOn.includes(t.key)} onChange={(e) => update(current.key, { dependsOn: e.target.checked ? [...current.dependsOn, t.key] : current.dependsOn.filter((d) => d !== t.key) })} /><span>{t.title}</span></label>
              ))}
              {tasks.length === 1 && <span className="small muted">Add more tasks to connect them.</span>}
            </div>
          </fieldset>
          <label className="small" style={{ display: "flex", gap: "var(--s3)", alignItems: "center", cursor: "pointer" }}>
            <span className="toggle"><input type="checkbox" checked={current.important} onChange={(e) => update(current.key, { important: e.target.checked })} /><i /></span>
            Important: run on two models and keep the better result (costs about twice as much)
          </label>
          <div><button type="button" className="btn ghost sm" onClick={() => remove(current.key)} disabled={tasks.length === 1}>Remove this task</button></div>
        </div>
      )}
    </div>
  );
}
