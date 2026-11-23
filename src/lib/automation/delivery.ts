import { timingSafeEqual } from "node:crypto";
import { assertPublicUrl } from "@/lib/orchestrator/web-fetch";

/** Accepted incoming-webhook hosts. Delivery is an external effect, so the list is short and explicit. */
const DELIVERY_HOSTS = /^(hooks\.slack\.com|discord\.com|discordapp\.com|[\w-]+\.webhook\.office\.com|[\w-]+\.logic\.azure\.com|hook\.eu1\.make\.com|hooks\.zapier\.com)$/;

export function validateDeliveryUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: "Not a valid URL" };
  }
  if (url.protocol !== "https:") return { ok: false, error: "Delivery URLs must use https" };
  if (!DELIVERY_HOSTS.test(url.hostname)) return { ok: false, error: "Use an incoming-webhook URL from Slack, Discord, Teams, Zapier or Make" };
  return { ok: true, url: url.toString() };
}

export type DeliveryRequest = { kind: "deliver"; summary: string; details: { url: string; host: string; title: string; preview: string } };

/**
 * Delivery never happens here directly: this only describes what *would* be sent, so it can wait
 * in the approvals inbox. Nothing irreversible runs without a human yes.
 */
export function planDelivery(input: { title: string; output: string; url: string }): DeliveryRequest {
  const host = new URL(input.url).hostname;
  return {
    kind: "deliver",
    summary: `Send the result of "${input.title}" to ${host}. This posts a message outside Ensemble and can't be unsent.`,
    details: { url: input.url, host, title: input.title, preview: input.output.slice(0, 1500) },
  };
}

/** Body shape both Slack ("text") and Discord ("content") accept. */
export function deliveryBody(title: string, output: string): string {
  const text = `*${title}*\n\n${output}`.slice(0, 1900);
  return JSON.stringify({ text, content: text });
}

/** Runs only after approval. Re-checks the URL and refuses private addresses and redirects. */
export async function sendDelivery(url: string, title: string, output: string, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; status: number }> {
  const valid = validateDeliveryUrl(url);
  if (!valid.ok) throw new Error(valid.error);
  await assertPublicUrl(valid.url);
  const res = await fetchImpl(valid.url, { method: "POST", redirect: "error", headers: { "content-type": "application/json" }, body: deliveryBody(title, output), signal: AbortSignal.timeout(10_000) });
  return { ok: res.ok, status: res.status };
}

/** Constant-time check for the cron secret, so the comparison doesn't leak how much matched. */
export function bearerMatches(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !header?.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
