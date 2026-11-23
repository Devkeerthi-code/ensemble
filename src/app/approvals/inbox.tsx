"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useToast } from "@/components/toast";
import { approvalAction } from "../orchestrator/actions";

export type InboxItem = { id: string; kind: string; summary: string; createdAt: string; runId: string; runTitle: string; preview: string | null; host: string | null };

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function ApprovalInbox({ initial }: { initial: InboxItem[] }) {
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  const { toast } = useToast();

  const decide = (item: InboxItem, approve: boolean) => {
    setBusy(item.id);
    start(async () => {
      const res = await approvalAction(item.id, approve);
      setBusy(null);
      if (!res.ok) {
        toast(res.error ?? "Couldn't record that. Try again.", { bad: true });
        return;
      }
      setItems((all) => all.filter((x) => x.id !== item.id));
      const deliver = item.kind === "deliver";
      toast(approve ? (deliver ? `Approved. Sending to ${item.host ?? "the webhook"}.` : "Approved. The step is back in the queue.") : (deliver ? "Rejected. Nothing was sent." : "Rejected. The step won't run."));
    });
  };

  if (items.length === 0) {
    return (
      <div className="panel">
        <div className="empty">
          <svg viewBox="0 0 180 70" aria-hidden="true"><g stroke="var(--rule)">{[15, 25, 35, 45, 55].map((y) => <line key={y} x1="0" x2="180" y1={y} y2={y} />)}</g><rect x="80" y="25" width="20" height="6" fill="var(--ink)" /></svg>
          <b>Nothing is waiting</b>
          <p className="small muted" style={{ maxWidth: "46ch" }}>When a run needs a costly step or wants to post a result to Slack, Discord or another webhook, it stops and asks here first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-h"><b>{items.length} waiting</b><span className="xs muted">Newest first</span></div>
      <ul className="inbox">
        {items.map((a) => {
          const deliver = a.kind === "deliver";
          const pending = busy === a.id;
          return (
            <li key={a.id} aria-busy={pending}>
              <div className="meta-row" style={{ alignItems: "center" }}>
                <span className={`kind-tag${deliver ? " risk" : ""}`}>{deliver ? "Deliver" : a.kind === "spend" ? "Spend" : a.kind}</span>
                <Link href={`/orchestrator/runs/${a.runId}`}>{a.runTitle}</Link>
                <span>{when(a.createdAt)}</span>
              </div>
              <p className="small">{a.summary}</p>
              {deliver && (
                <>
                  <p className="warnline">Approving posts this text to <b>{a.host ?? "the delivery URL"}</b>, outside Ensemble. It can&apos;t be unsent.</p>
                  {a.preview && <pre className="cmd prose" aria-label="What will be posted">{a.preview}</pre>}
                </>
              )}
              <div className="out">
                <button className="btn accent sm" type="button" disabled={busy !== null} onClick={() => decide(a, true)}>{pending ? "Saving…" : deliver ? "Approve and send" : "Approve"}</button>
                <button className="btn sm" type="button" disabled={busy !== null} onClick={() => decide(a, false)}>Reject</button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
