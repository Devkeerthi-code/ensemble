import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/server/db";
import { isAdmin, requireUser } from "@/lib/server/session";
import { USAGE_EVENTS } from "@/lib/server/telemetry";
import { KILL_SWITCH_KEY } from "@/lib/server/orchestrator/prisma-store";
import { killSwitchAction } from "../settings/actions";

export const metadata: Metadata = { title: "Usage" };

export default async function AdminPage() {
  const user = await requireUser();
  if (!isAdmin(user.email)) notFound();
  const [users, grouped, kill, audits] = await Promise.all([
    db.user.count(),
    db.usageEvent.groupBy({ by: ["event"], _count: { _all: true } }),
    db.systemSetting.findUnique({ where: { key: KILL_SWITCH_KEY } }),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 25, select: { id: true, action: true, createdAt: true } }),
  ]);
  const killOn = kill?.value === "on";
  const counts = new Map(grouped.map((g) => [g.event, g._count._all]));
  return (
    <div className="wrap app-main">
      <div className="sh">
        <div>
          <h1 style={{ fontSize: "var(--t-xl)" }}>Usage</h1>
          <p>Counts only. No content, IPs or per-user activity are stored.</p>
        </div>
      </div>
      <form action={killSwitchAction} className="panel panel-b out" style={{ marginBottom: "var(--s4)", borderColor: killOn ? "var(--accent)" : undefined }}>
        <input type="hidden" name="on" value={killOn ? "off" : "on"} />
        <b>Kill switch is {killOn ? "ON: no model calls run anywhere" : "off"}</b>
        <button className={killOn ? "btn sm" : "btn accent sm"} type="submit">{killOn ? "Turn off" : "Stop all runs now"}</button>
      </form>
      <div className="agent-grid">
        <div className="panel panel-b stat"><span className="small muted">Accounts</span><b>{users}</b></div>
        {USAGE_EVENTS.map((e) => (
          <div className="panel panel-b stat" key={e}><span className="small muted">{e.replace(/_/g, " ")}</span><b>{counts.get(e) ?? 0}</b></div>
        ))}
      </div>
      <div className="panel" style={{ marginTop: "var(--s4)" }}>
        <div className="panel-h"><b>Recent audit log</b></div>
        <ul className="card-list">{audits.map((a) => <li key={String(a.id)}><code className="xs">{a.action}</code><span className="xs muted">{a.createdAt.toISOString().replace("T", " ").slice(0, 19)}</span></li>)}</ul>
      </div>
    </div>
  );
}
