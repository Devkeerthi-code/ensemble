import type { Metadata } from "next";
import { db } from "@/lib/server/db";
import { requireUser } from "@/lib/server/session";
import { ApprovalInbox, type InboxItem } from "./inbox";

export const metadata: Metadata = { title: "Approvals" };

const text = (v: unknown) => (typeof v === "string" ? v : null);

export default async function ApprovalsPage() {
  const user = await requireUser();
  const rows = await db.approval.findMany({
    where: { userId: user.id, status: "pending" },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { run: { select: { id: true, goal: { select: { title: true } } } } },
  });
  const items: InboxItem[] = rows.map((a) => {
    const details = a.details && typeof a.details === "object" && !Array.isArray(a.details) ? (a.details as Record<string, unknown>) : {};
    return {
      id: a.id,
      kind: a.kind,
      summary: a.summary,
      createdAt: a.createdAt.toISOString(),
      runId: a.run.id,
      runTitle: a.run.goal.title,
      preview: a.kind === "deliver" ? text(details.preview) : null,
      host: a.kind === "deliver" ? text(details.host) : null,
    };
  });

  return (
    <div className="wrap app-main">
      <div className="sh">
        <div>
          <div className="eyebrow"><span className="mark">G</span>Approvals</div>
          <h1 style={{ fontSize: "var(--t-xl)" }}>Steps waiting for your yes</h1>
          <p>Runs pause here before a step spends more than your threshold, and before a result is posted outside Ensemble. Nothing in this list happens until you approve it.</p>
        </div>
      </div>
      <ApprovalInbox initial={items} />
    </div>
  );
}
