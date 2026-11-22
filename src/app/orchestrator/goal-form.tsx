"use client";

import { useActionState } from "react";
import { createGoalAction, type FormState } from "./actions";

export function GoalForm({ maxBudget }: { maxBudget: number }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createGoalAction, {});
  const err = (k: string) => state.fieldErrors?.[k] && <span className="err">{state.fieldErrors[k]}</span>;
  return (
    <form action={action} className="brief" noValidate>
      <div className="field">
        <label htmlFor="title">Goal</label>
        <textarea id="title" name="title" rows={3} required maxLength={200} placeholder="Research the three cheapest ways for our college club to host a website and write a recommendation." style={{ fontFamily: "var(--font)", fontSize: "var(--t-sm)" }} />
        {err("title")}
      </div>
      <div className="field">
        <label htmlFor="criteria">Done when</label>
        <textarea id="criteria" name="criteria" rows={2} required maxLength={2000} placeholder="A one-page brief with prices, pros and cons, sources, and a clear pick." style={{ fontFamily: "var(--font)", fontSize: "var(--t-sm)" }} />
        {err("criteria")}
      </div>
      <div className="two">
        <div className="field">
          <label htmlFor="priority">Priority</label>
          <select id="priority" name="priority" className="input" defaultValue="normal"><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select>
        </div>
        <div className="field">
          <label htmlFor="budgetUsd">Budget cap (USD)</label>
          <input id="budgetUsd" name="budgetUsd" className="input" type="number" min={0.01} max={maxBudget} step={0.01} defaultValue={0.2} required />
          {err("budgetUsd")}
        </div>
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label">Prefer</legend>
        <div className="seg" role="radiogroup" style={{ marginTop: "var(--s2)" }}>
          {(["quality", "speed", "cost"] as const).map((p, i) => (
            <label key={p}><input type="radio" name="preference" value={p} defaultChecked={i === 0} /><span>{p[0]!.toUpperCase() + p.slice(1)}</span></label>
          ))}
        </div>
      </fieldset>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <button className="btn primary" type="submit" disabled={pending}>{pending ? "Planning… (10–40 s)" : "Plan it"}</button>
      <p className="xs muted">Planning makes one model call against your budget. You review and edit the plan before anything else runs.</p>
    </form>
  );
}
