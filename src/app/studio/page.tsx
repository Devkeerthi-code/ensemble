import type { Metadata } from "next";
import Link from "next/link";
import { answersSchema, DEFAULT_ANSWERS, type Answers } from "@/lib/setup/answers";
import { db } from "@/lib/server/db";
import { currentUser } from "@/lib/server/session";
import { StudioWizard } from "./wizard";

export const metadata: Metadata = { title: "Setup Studio" };

async function loadSaved(userId: string | undefined, id: string | undefined): Promise<Answers | null> {
  if (!userId || !id) return null;
  const row = await db.setupProfile.findFirst({ where: { id, userId }, select: { answers: true } });
  const parsed = answersSchema.safeParse(row?.answers);
  return parsed.success ? parsed.data : null;
}

export default async function StudioPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const user = await currentUser();
  const saved = await loadSaved(user?.id, id);
  return (
    <div className="wrap app-main">
      <div className="sh">
        <div>
          <div className="eyebrow"><span className="mark">B</span>Setup Studio</div>
          <h1 style={{ fontSize: "var(--t-xl)" }}>{saved ? `Editing ${saved.projectName}` : "Tell us how you work"}</h1>
          <p>Six short steps. Each answer changes the files, and every line comes with a note explaining what it does.</p>
        </div>
        {user && <Link className="btn sm" href="/studio/saved">Saved setups</Link>}
      </div>
      <StudioWizard key={id ?? "new"} initial={saved ?? DEFAULT_ANSWERS} signedIn={Boolean(user)} setupId={saved ? id : undefined} />
    </div>
  );
}
