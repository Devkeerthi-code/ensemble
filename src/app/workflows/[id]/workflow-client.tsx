"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { deleteWorkflowAction, duplicateWorkflowAction, rotateWebhookAction, runWorkflowNowAction, toggleWorkflowAction, updateWorkflowAction, type WorkflowFormState } from "../actions";
import { SettingsFields, type SettingsDefaults } from "../settings-fields";

export function WorkflowControls({ workflowId, enabled }: { workflowId: string; enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  const [runId, setRunId] = useState<string | null>(null);
  const [running, startRun] = useTransition();
  const [toggling, startToggle] = useTransition();
  const [copying, startCopy] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  const runNow = () => startRun(async () => {
    const res = await runWorkflowNowAction(workflowId);
    setRunId(res.runId ?? null);
    toast(res.ok ? "Run started. Open it to watch the agents work." : (res.error ?? "Couldn't start the run"), { bad: !res.ok });
    router.refresh();
  });
  // On success the action redirects to the copy, so only failures come back here.
  const duplicate = () => startCopy(async () => {
    const res = await duplicateWorkflowAction(workflowId);
    if (!res.ok) toast(res.error ?? "Couldn't copy this workflow", { bad: true });
  });
  const toggle = (next: boolean) => {
    setOn(next);
    startToggle(async () => {
      const res = await toggleWorkflowAction(workflowId, next);
      if (!res.ok) {
        setOn(!next);
        toast("Couldn't change that. Try again.", { bad: true });
        return;
      }
      toast(next ? "Turned on. Schedule and webhook can start runs." : "Turned off. Schedule and webhook won't start runs.");
      router.refresh();
    });
  };

  return (
    <div className="wf-actions">
      <label className="switch">
        <span className="toggle"><input type="checkbox" checked={on} disabled={toggling} onChange={(e) => toggle(e.target.checked)} /><i /></span>
        {on ? "On" : "Off"}
      </label>
      <button className="btn sm" type="button" disabled={copying} onClick={duplicate} title="Copies the plan and settings. The copy starts switched off.">{copying ? "Copying…" : "Duplicate"}</button>
      <button className="btn accent" type="button" disabled={running} onClick={runNow}>{running ? "Starting…" : "Run now"}</button>
      {runId && <Link className="small" href={`/orchestrator/runs/${runId}`}>Open the run</Link>}
    </div>
  );
}

export function WorkflowSettingsForm({ workflowId, defaults, maxBudget }: { workflowId: string; defaults: SettingsDefaults; maxBudget: number }) {
  const [state, action, pending] = useActionState<WorkflowFormState, FormData>(updateWorkflowAction.bind(null, workflowId), {});
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && submitted && !state.error) toast("Settings saved");
    wasPending.current = pending;
  }, [pending, submitted, state.error, toast]);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setSubmitted(true);
    startTransition(() => action(data));
  };

  return (
    <form className="q" onSubmit={submit} aria-busy={pending}>
      <SettingsFields defaults={defaults} maxBudget={maxBudget} />
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <div><button className="btn primary" type="submit" disabled={pending}>{pending ? "Saving…" : "Save settings"}</button></div>
    </form>
  );
}

export function WebhookPanel({ workflowId, hasToken, origin, inputNames }: { workflowId: string; hasToken: boolean; origin: string; inputNames: string[] }) {
  const [token, setToken] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const body = inputNames.length ? JSON.stringify({ inputs: Object.fromEntries(inputNames.map((n) => [n, "…"])) }) : "{}";
  const curl = `curl -X POST ${origin}/api/hooks/${workflowId} \\\n  -H "Authorization: Bearer ${token ?? "<token>"}" \\\n  -H "content-type: application/json" \\\n  -d '${body}'`;

  const rotate = () => start(async () => {
    const res = await rotateWebhookAction(workflowId);
    if (res.token) setToken(res.token);
    else toast(res.error ?? "Couldn't create a token", { bad: true });
  });

  return (
    <div className="panel-b stack" style={{ gap: "var(--s3)" }}>
      <p className="small">Start a run from a form, Zapier or GitHub Actions with one POST request.{inputNames.length > 0 && " Send new inputs to change what it works on; leave them out to reuse the saved ones."}</p>
      {token ? (
        <p className="small" role="status"><b>Copy this now. The token won&apos;t be shown again.</b></p>
      ) : (
        <p className="xs muted">{hasToken ? "A token exists. Only its hash is stored, so it can't be shown again. Rotating stops the old one working at once." : "No token yet. The example below needs one."}</p>
      )}
      <pre className="cmd" aria-label="Example request">{curl}</pre>
      <div className="out">
        <button className="btn sm" type="button" disabled={pending} onClick={rotate}>{pending ? "Creating…" : hasToken || token ? "Rotate token" : "Create token"}</button>
        {token && <button className="btn sm primary" type="button" onClick={() => navigator.clipboard.writeText(curl.replace(/\\\n\s+/g, "")).then(() => toast("Command copied"), () => toast("Couldn't copy. Select the text instead.", { bad: true }))}>Copy command</button>}
      </div>
    </div>
  );
}

export function DeleteWorkflow({ workflowId, name }: { workflowId: string; name: string }) {
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();
  const keepRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (asking) keepRef.current?.focus();
  }, [asking]);

  if (!asking) return <div><button className="btn ghost sm" type="button" onClick={() => setAsking(true)}>Delete workflow</button></div>;
  return (
    <div className="confirm" role="group" aria-labelledby="del-q">
      <p className="small" id="del-q"><b>Delete &ldquo;{name}&rdquo;?</b> Its schedule and webhook stop. Past runs stay in the Orchestrator.</p>
      <div className="out">
        <button className="btn accent sm" type="button" disabled={pending} onClick={() => start(() => deleteWorkflowAction(workflowId))}>{pending ? "Deleting…" : "Yes, delete it"}</button>
        <button ref={keepRef} className="btn sm" type="button" disabled={pending} onClick={() => setAsking(false)}>Keep it</button>
      </div>
    </div>
  );
}
