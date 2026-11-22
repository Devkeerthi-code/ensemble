import { db } from "@/lib/server/db";
import { currentUser } from "@/lib/server/session";
import { runSnapshot } from "@/lib/server/orchestrator/snapshot";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

/**
 * Server-sent events for the live run view. The worker is a separate process, so this polls the
 * append-only RunEvent table once a second and pushes a fresh snapshot whenever something changed.
 * EventSource reconnects with Last-Event-ID, so nothing is missed after a timeout.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  const { id } = await params;
  const first = await runSnapshot(user.id, id);
  if (!first) return new Response("Not found", { status: 404 });

  const encoder = new TextEncoder();
  let lastId = BigInt(req.headers.get("last-event-id") || "0");
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown, eventId?: bigint) =>
        controller.enqueue(encoder.encode(`${eventId !== undefined ? `id: ${eventId}\n` : ""}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      send("snapshot", first);
      let idleAfterEnd = 0;
      while (!req.signal.aborted) {
        await new Promise((r) => setTimeout(r, 1000));
        const events = await db.runEvent.findMany({ where: { runId: id, id: { gt: lastId } }, orderBy: { id: "asc" }, take: 200 });
        if (events.length) {
          lastId = events[events.length - 1]!.id;
          const snap = await runSnapshot(user.id, id);
          if (!snap) break;
          send("snapshot", snap, lastId);
          send("events", events.map((e) => ({ type: e.type, payload: e.payload, at: e.createdAt.toISOString() })));
          if (TERMINAL.has(snap.status)) idleAfterEnd = 1;
        } else {
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
          if (idleAfterEnd && ++idleAfterEnd > 5) break;
        }
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" } });
}
