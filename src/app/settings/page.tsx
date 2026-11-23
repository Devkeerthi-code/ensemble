import type { Metadata } from "next";
import { PROVIDER_LABELS } from "@/lib/orchestrator/catalog";
import { db } from "@/lib/server/db";
import { requireUser } from "@/lib/server/session";
import { listProviderKeys } from "@/lib/server/orchestrator/keys";
import { deleteKeyAction, deleteTokenAction } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { KeyForm, TestKeyButton, TokenCreator } from "./settings-client";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const [keys, tokens] = await Promise.all([listProviderKeys(user.id), db.apiToken.findMany({ where: { userId: user.id }, select: { id: true, name: true, createdAt: true, lastUsedAt: true } })]);
  return (
    <div className="wrap app-main stack">
      <div className="sh" style={{ marginBottom: 0 }}><div><div className="eyebrow">Account</div><h1 style={{ fontSize: "var(--t-xl)" }}>Settings</h1><p>Your keys are encrypted (AES-256-GCM) before they are stored, are never sent back to the browser and are never logged.</p></div></div>
      <div className="panel">
        <div className="panel-h"><h2 style={{ fontSize: "var(--t-lg)" }}>Provider keys</h2></div>
        <ul className="card-list">
          {keys.map((k) => (
            <li key={k.provider}>
              <div>
                <b>{PROVIDER_LABELS[k.provider]}</b>
                <p className="xs muted">{k.own ? `Your key ending ${k.own.last4}` : k.serverKey ? "Using Ensemble's shared key (small daily cap)" : "Not set up"}</p>
              </div>
              <div className="out">
                {(k.own || k.serverKey) && <TestKeyButton provider={k.provider} />}
                {k.own && <form action={deleteKeyAction}><input type="hidden" name="provider" value={k.provider} /><SubmitButton className="btn ghost sm" pendingText="Removing…">Remove</SubmitButton></form>}
              </div>
            </li>
          ))}
        </ul>
        <div className="panel-b" style={{ borderTop: "1px solid var(--rule)" }}><KeyForm /></div>
      </div>
      <div className="panel">
        <div className="panel-h"><h2 style={{ fontSize: "var(--t-lg)" }}>Use Ensemble from Claude Code (MCP)</h2></div>
        <div className="panel-b stack">
          <p className="small">Create a token, then add Ensemble as an MCP server. Claude Code and other MCP clients can then send goals and read results.</p>
          <TokenCreator />
          {tokens.length === 0 ? <p className="xs muted">No tokens yet.</p> : (
            <ul className="card-list" style={{ border: "1px solid var(--rule)", borderRadius: "var(--r)" }}>
              {tokens.map((t) => (
                <li key={t.id}><span className="small" style={{ minWidth: 0, overflowWrap: "anywhere" }}>{t.name} · created {t.createdAt.toLocaleDateString("en-GB")}{t.lastUsedAt ? ` · last used ${t.lastUsedAt.toLocaleDateString("en-GB")}` : ""}</span>
                  <form action={deleteTokenAction}><input type="hidden" name="id" value={t.id} /><SubmitButton className="btn ghost sm" pendingText="Revoking…">Revoke</SubmitButton></form></li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
