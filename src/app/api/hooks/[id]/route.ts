import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/server/rate-limit";
import { audit } from "@/lib/server/telemetry";
import { startWorkflowRun, workflowByWebhookToken } from "@/lib/server/automation/workflows";

export const dynamic = "force-dynamic";

const body = z.object({ inputs: z.record(z.string(), z.string().max(20_000)).optional() }).strict();

/**
 * Starts a workflow run from outside (a form, Zapier, GitHub Actions…).
 * POST /api/hooks/<workflowId> with "Authorization: Bearer whk_…" and optional {"inputs": {...}}.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const wf = await workflowByWebhookToken(id, token);
  if (!wf) return NextResponse.json({ error: "Unknown workflow or wrong token" }, { status: 401 });
  const limited = await rateLimit(`hook:${wf.id}`, 30, 60 * 60);
  if (!limited.ok) return NextResponse.json({ error: "Rate limited" }, { status: 429, headers: { "retry-after": String(limited.retryAfterSeconds) } });
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Body must be {\"inputs\": {\"name\": \"value\"}}" }, { status: 400 });
  const res = await startWorkflowRun(wf, "webhook", parsed.data.inputs);
  await audit("webhook_trigger", { userId: wf.userId, target: wf.id, meta: { ok: res.ok } });
  if (!res.ok) return NextResponse.json({ error: res.error, runId: res.runId }, { status: 422 });
  return NextResponse.json({ runId: res.runId, url: `${new URL(req.url).origin}/orchestrator/runs/${res.runId}` }, { status: 202 });
}
