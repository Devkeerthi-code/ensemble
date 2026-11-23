import { NextResponse } from "next/server";
import { bearerMatches } from "@/lib/automation/delivery";
import { runDueWorkflows } from "@/lib/server/automation/workflows";
import { audit } from "@/lib/server/telemetry";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Called every few minutes by cron-job.org (or Vercel Cron) with "Authorization: Bearer $CRON_SECRET".
 * Starts every workflow whose schedule is due. Safe to call often or twice: runs are claimed atomically.
 */
async function handle(req: Request) {
  if (!bearerMatches(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const started = await runDueWorkflows();
  await audit("cron_tick", { meta: { started: started.length } });
  return NextResponse.json({ started });
}

export const GET = handle;
export const POST = handle;
