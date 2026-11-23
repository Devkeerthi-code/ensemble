"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useToast } from "@/components/toast";
import { saveRunAsWorkflowAction } from "@/app/workflows/actions";

/** Inline "name it" row shown under the run header. The action redirects to the new workflow on success. */
export function SaveWorkflowRow({ runId, defaultName, onClose }: { runId: string; defaultName: string; onClose: () => void }) {
  const [name, setName] = useState(defaultName.slice(0, 80));
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await saveRunAsWorkflowAction(runId, name);
      if (!res.ok) toast(res.error ?? "Couldn't save the workflow", { bad: true });
    });
  };

  return (
    <form className="save-row" onSubmit={save} aria-label="Save as workflow">
      <div className="field">
        <label htmlFor="wf-save-name">Workflow name</label>
        <input ref={inputRef} id="wf-save-name" className="input" value={name} onChange={(e) => setName(e.target.value)} minLength={3} maxLength={80} required autoComplete="off" />
      </div>
      <div className="out">
        <button className="btn primary" type="submit" disabled={pending || name.trim().length < 3}>{pending ? "Saving…" : "Save workflow"}</button>
        <button className="btn ghost" type="button" disabled={pending} onClick={onClose}>Cancel</button>
      </div>
      <p className="hint" style={{ flexBasis: "100%" }}>Saves this plan, budget and priority. Add a schedule or webhook on the next page.</p>
    </form>
  );
}
