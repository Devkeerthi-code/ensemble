import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/server/db";
import { requireUser } from "@/lib/server/session";
import { deleteSetupAction } from "../actions";

export const metadata: Metadata = { title: "Saved setups" };

export default async function SavedSetupsPage() {
  const user = await requireUser();
  const setups = await db.setupProfile.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, templateVersion: true, updatedAt: true },
    take: 50,
  });
  return (
    <div className="wrap app-main">
      <div className="sh"><div><div className="eyebrow"><span className="mark">B</span>Setup Studio</div><h1 style={{ fontSize: "var(--t-xl)" }}>Saved setups</h1></div>
        <Link className="btn primary" href="/studio">New setup</Link></div>
      <div className="panel">
        {setups.length === 0 ? (
          <div className="empty">
            <svg viewBox="0 0 180 70" aria-hidden="true"><g stroke="var(--rule)">{[15, 25, 35, 45, 55].map((y) => <line key={y} x1="0" x2="180" y1={y} y2={y} />)}</g><rect x="80" y="25" width="20" height="6" fill="var(--ink)" /></svg>
            <b>No saved setups yet</b>
            <p className="small muted">Answer the questions in Setup Studio and press Save setup.</p>
          </div>
        ) : (
          <ul className="card-list">
            {setups.map((s) => (
              <li key={s.id}>
                <div><b>{s.name}</b><p className="xs muted">Templates v{s.templateVersion} · updated {s.updatedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p></div>
                <div className="out">
                  <Link className="btn sm" href={`/studio?id=${s.id}`}>Open</Link>
                  <form action={deleteSetupAction}><input type="hidden" name="id" value={s.id} /><button className="btn ghost sm" type="submit">Delete</button></form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
