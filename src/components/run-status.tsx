const DATA: Record<string, string> = { running: "running", queued: "queued", paused: "queued", completed: "completed", failed: "failed", cancelled: "cancelled", draft: "queued" };
const LABEL: Record<string, string> = { draft: "Draft", queued: "Queued", running: "Running", paused: "Paused", completed: "Completed", failed: "Failed", cancelled: "Cancelled" };

/** Run status as a note head plus a word, so it never relies on colour alone. */
export function RunStatus({ status }: { status: string }) {
  return <span className="st" data-s={DATA[status] ?? "queued"}><i className="head" aria-hidden="true" />{LABEL[status] ?? status}</span>;
}
