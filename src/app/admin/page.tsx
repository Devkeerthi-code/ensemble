import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/server/db";
import { isAdmin, requireUser } from "@/lib/server/session";
import { USAGE_EVENTS } from "@/lib/server/telemetry";

export const metadata: Metadata = { title: "Usage" };

export default async function AdminPage() {
  const user = await requireUser();
  if (!isAdmin(user.email)) notFound();
  const [users, grouped] = await Promise.all([db.user.count(), db.usageEvent.groupBy({ by: ["event"], _count: { _all: true } })]);
  const counts = new Map(grouped.map((g) => [g.event, g._count._all]));
  return (
    <div className="wrap app-main">
      <div className="sh">
        <div>
          <h1 style={{ fontSize: "var(--t-xl)" }}>Usage</h1>
          <p>Counts only. No content, IPs or per-user activity are stored.</p>
        </div>
      </div>
      <div className="agent-grid">
        <div className="panel panel-b stat"><span className="small muted">Accounts</span><b>{users}</b></div>
        {USAGE_EVENTS.map((e) => (
          <div className="panel panel-b stat" key={e}><span className="small muted">{e.replace(/_/g, " ")}</span><b>{counts.get(e) ?? 0}</b></div>
        ))}
      </div>
    </div>
  );
}
