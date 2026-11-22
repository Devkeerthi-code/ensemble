import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/server/rate-limit";
import { clientIp } from "@/lib/server/request";
import { track } from "@/lib/server/telemetry";

const body = z.object({ event: z.enum(["zip_downloaded", "cli_copied"]) });

/** Anonymous counters for client-side actions. Stores the event name and time only. */
export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Unknown event" }, { status: 400 });
  const limited = await rateLimit(`track:${await clientIp()}`, 60, 60 * 60);
  if (limited.ok) await track(parsed.data.event);
  return new NextResponse(null, { status: 204 });
}
