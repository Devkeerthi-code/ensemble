import Link from "next/link";
import { requireUser } from "@/lib/server/session";

export default async function OrchestratorPage() {
  await requireUser();
  return (
    <div className="wrap app-main">
      <div className="panel empty"><b>Orchestrator is coming next</b><p className="small muted">Setup Studio and Doctor are ready to use now.</p><Link className="btn" href="/studio">Open Setup Studio</Link></div>
    </div>
  );
}
