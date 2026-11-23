"use client";

import { startTransition, useActionState } from "react";
import type { TemplateInput } from "@/lib/automation/templates";
import { createFromTemplateAction, type WorkflowFormState } from "../actions";
import { SettingsFields } from "../settings-fields";

type Props = { templateId: string; templateName: string; inputs: TemplateInput[]; maxBudget: number };

export function NewWorkflowForm({ templateId, templateName, inputs, maxBudget }: Props) {
  const [state, action, pending] = useActionState<WorkflowFormState, FormData>(createFromTemplateAction, {});

  // Dispatching from onSubmit (not the form action prop) keeps what the user typed if the server returns an error.
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  };

  return (
    <form className="q" onSubmit={submit} aria-busy={pending}>
      <input type="hidden" name="template" value={templateId} />
      <fieldset>
        <legend>What to work on</legend>
        {inputs.map((i) => (
          <div className="field" key={i.name}>
            <label htmlFor={`in-${i.name}`}>{i.label}</label>
            {i.kind === "longtext" ? (
              <textarea id={`in-${i.name}`} name={`in_${i.name}`} rows={8} required maxLength={i.max} aria-describedby={`in-${i.name}-hint`} style={{ fontFamily: "var(--font)", fontSize: "var(--t-sm)" }} />
            ) : (
              <input id={`in-${i.name}`} name={`in_${i.name}`} className="input" type={i.kind === "url" ? "url" : "text"} inputMode={i.kind === "url" ? "url" : undefined} required maxLength={i.max} aria-describedby={`in-${i.name}-hint`} autoComplete="off" />
            )}
            <span id={`in-${i.name}-hint`} className="hint">{i.hint}</span>
          </div>
        ))}
      </fieldset>
      <SettingsFields maxBudget={maxBudget} defaults={{ name: templateName.slice(0, 80), budgetUsd: 0.2, priority: "normal", preference: "quality", schedule: null, deliveryUrl: null }} />
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <div className="q-foot">
        <p className="xs muted" style={{ alignSelf: "center" }}>Creating it doesn&apos;t start a run.</p>
        <button className="btn primary" type="submit" disabled={pending}>{pending ? "Creating…" : "Create workflow"}</button>
      </div>
    </form>
  );
}
