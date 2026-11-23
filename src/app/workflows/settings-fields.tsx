"use client";

import { useState } from "react";
import { SCHEDULE_PRESETS } from "@/lib/automation/cron";

export type SettingsDefaults = {
  name: string;
  budgetUsd: number;
  priority: "high" | "normal" | "low";
  preference: "quality" | "speed" | "cost";
  schedule: string | null;
  deliveryUrl: string | null;
};

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

function Seg<T extends string>({ name, legend, options, value }: { name: string; legend: string; options: readonly T[]; value: T }) {
  return (
    <fieldset className="plain">
      <legend className="label">{legend}</legend>
      <div className="seg">
        {options.map((o) => (
          <label key={o}><input type="radio" name={name} value={o} defaultChecked={o === value} /><span>{cap(o)}</span></label>
        ))}
      </div>
    </fieldset>
  );
}

function ScheduleField({ initial }: { initial: string | null }) {
  const preset = SCHEDULE_PRESETS.find((p) => p.cron === initial);
  const [choice, setChoice] = useState<string>(!initial ? "none" : preset ? preset.cron : "custom");
  const [custom, setCustom] = useState(initial && !preset ? initial : "0 9 * * 1");
  const value = choice === "none" ? "" : choice === "custom" ? custom : choice;
  const options = [{ label: "No schedule", cron: "none" }, ...SCHEDULE_PRESETS, { label: "Custom cron", cron: "custom" }];

  return (
    <fieldset>
      <legend>When it runs</legend>
      <p className="hint">Times are UTC. A workflow can run at most once an hour. You can always run it by hand or from a webhook.</p>
      <div className="chips" role="radiogroup" aria-label="Schedule">
        {options.map((o) => (
          <label className="chip" key={o.cron}>
            <input type="radio" name="scheduleChoice" value={o.cron} checked={choice === o.cron} onChange={() => setChoice(o.cron)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      {choice === "custom" && (
        <div className="custom-cron field">
          <label htmlFor="cron">Cron expression (minute hour day month weekday)</label>
          <input id="cron" className="input mono" value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={60} spellCheck={false} autoComplete="off" aria-describedby="cron-hint" />
          <span id="cron-hint" className="hint">e.g. <code>0 9 * * 1</code> is every Monday at 09:00 UTC.</span>
        </div>
      )}
      <input type="hidden" name="schedule" value={value} />
    </fieldset>
  );
}

/** The settings shared by "new workflow" and "edit workflow". Field names match workflowSettingsSchema. */
export function SettingsFields({ defaults, maxBudget }: { defaults: SettingsDefaults; maxBudget: number }) {
  return (
    <>
      <fieldset>
        <legend>Settings</legend>
        <div className="field">
          <label htmlFor="wf-name">Workflow name</label>
          <input id="wf-name" name="name" className="input" required minLength={3} maxLength={80} defaultValue={defaults.name} />
        </div>
        <div className="field">
          <label htmlFor="wf-budget">Budget cap per run (USD)</label>
          <input id="wf-budget" name="budgetUsd" className="input narrow" type="number" inputMode="decimal" min={0.01} max={maxBudget} step={0.01} required defaultValue={defaults.budgetUsd} aria-describedby="wf-budget-hint" />
          <span id="wf-budget-hint" className="hint">Each run stops before it goes over this. Up to ${maxBudget.toFixed(2)}.</span>
        </div>
        <div className="wf-actions" style={{ alignItems: "flex-start", gap: "var(--s5)" }}>
          <Seg name="priority" legend="Priority" options={["high", "normal", "low"] as const} value={defaults.priority} />
          <Seg name="preference" legend="Prefer" options={["quality", "speed", "cost"] as const} value={defaults.preference} />
        </div>
      </fieldset>
      <ScheduleField initial={defaults.schedule} />
      <fieldset>
        <legend>Send the result somewhere (optional)</legend>
        <div className="field">
          <label htmlFor="wf-delivery">Incoming-webhook URL</label>
          <input id="wf-delivery" name="deliveryUrl" className="input" type="url" inputMode="url" maxLength={500} placeholder="https://hooks.slack.com/services/…" defaultValue={defaults.deliveryUrl ?? ""} aria-describedby="wf-delivery-hint" />
          <span id="wf-delivery-hint" className="hint">Slack, Discord, Teams, Zapier or Make. Results are posted here only after you approve each delivery in Approvals.</span>
        </div>
      </fieldset>
    </>
  );
}
