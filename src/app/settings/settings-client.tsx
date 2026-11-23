"use client";

import { useActionState, useState, useTransition } from "react";
import { PROVIDERS, PROVIDER_LABELS, type Provider } from "@/lib/orchestrator/catalog";
import { useToast } from "@/components/toast";
import { createTokenAction, saveKeyAction, testKeyAction } from "./actions";

export function KeyForm() {
  const [state, action, pending] = useActionState(saveKeyAction, {});
  return (
    <form action={action} className="stack" style={{ gap: "var(--s3)" }}>
      <div className="two">
        <div className="field">
          <label htmlFor="provider">Provider</label>
          <select id="provider" name="provider" className="input">{PROVIDERS.filter((p) => p !== "ollama").map((p) => <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>)}</select>
        </div>
        <div className="field">
          <label htmlFor="key">API key</label>
          <input id="key" name="key" type="password" autoComplete="off" className="input" required />
        </div>
      </div>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      {state.ok && <p className="small" role="status">Saved and encrypted.</p>}
      <div><button className="btn primary sm" type="submit" disabled={pending}>{pending ? "Saving…" : "Save key"}</button></div>
      <p className="xs muted">Ollama runs on your own machine: set OLLAMA_BASE_URL on the worker instead of a key.</p>
    </form>
  );
}

export function TestKeyButton({ provider }: { provider: Provider }) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  return (
    <button className="btn sm" type="button" disabled={pending} onClick={() => start(async () => {
      const h = await testKeyAction(provider);
      toast(`${PROVIDER_LABELS[provider]}: ${h.detail}${h.ok ? ` (${h.latencyMs} ms)` : ""}`, { bad: !h.ok });
    })}>{pending ? "Checking…" : "Health check"}</button>
  );
}

export function TokenCreator() {
  const [token, setToken] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const command = token ? `claude mcp add --transport http ensemble ${origin}/api/mcp --header "Authorization: Bearer ${token}"` : "";
  return (
    <div className="stack" style={{ gap: "var(--s2)" }}>
      <div><button className="btn sm" type="button" disabled={pending} onClick={() => start(async () => { const r = await createTokenAction(); if (r.token) setToken(r.token); else toast(r.error ?? "Couldn't create a token", { bad: true }); })}>{pending ? "Creating…" : "Create a token"}</button></div>
      {token && (
        <>
          <p className="small"><b>Copy this now. It won&apos;t be shown again.</b></p>
          <div className="npx"><code style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{command}</code><button className="btn sm" type="button" onClick={() => navigator.clipboard.writeText(command).then(() => toast("Command copied"), () => toast("Couldn't copy. Select the text instead.", { bad: true }))}>Copy</button></div>
        </>
      )}
    </div>
  );
}
