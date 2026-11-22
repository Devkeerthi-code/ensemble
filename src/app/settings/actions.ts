"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PROVIDERS, type Provider } from "@/lib/orchestrator/catalog";
import { sha256 } from "@/lib/orchestrator/crypto";
import { checkHealth, type Health } from "@/lib/orchestrator/ai-sdk-client";
import { db } from "@/lib/server/db";
import { rateLimit } from "@/lib/server/rate-limit";
import { isAdmin, requireUser } from "@/lib/server/session";
import { audit } from "@/lib/server/telemetry";
import { deleteProviderKey, keyFor, saveProviderKey } from "@/lib/server/orchestrator/keys";
import { KILL_SWITCH_KEY } from "@/lib/server/orchestrator/prisma-store";

const provider = z.enum(PROVIDERS);

export async function saveKeyAction(_prev: { error?: string; ok?: boolean }, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireUser();
  const parsed = z.object({ provider, key: z.string().trim().min(8, "That doesn't look like a full key").max(400) }).safeParse({ provider: form.get("provider"), key: form.get("key") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  await saveProviderKey(user.id, parsed.data.provider, parsed.data.key);
  await audit("provider_key_saved", { userId: user.id, target: parsed.data.provider });
  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteKeyAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const p = provider.safeParse(form.get("provider"));
  if (!p.success) return;
  await deleteProviderKey(user.id, p.data);
  await audit("provider_key_deleted", { userId: user.id, target: p.data });
  revalidatePath("/settings");
}

export async function testKeyAction(p: Provider): Promise<Health> {
  const user = await requireUser();
  if (!provider.safeParse(p).success) return { ok: false, latencyMs: 0, detail: "Unknown provider" };
  const limited = await rateLimit(`health:${user.id}`, 30, 60 * 60);
  if (!limited.ok) return { ok: false, latencyMs: 0, detail: "Too many checks, try later" };
  const key = await keyFor(user.id, p);
  if (!key) return { ok: false, latencyMs: 0, detail: "No key set" };
  return checkHealth(p, key);
}

/** The token is shown once; only its hash is stored. */
export async function createTokenAction(): Promise<{ token?: string; error?: string }> {
  const user = await requireUser();
  if ((await db.apiToken.count({ where: { userId: user.id } })) >= 5) return { error: "You already have 5 tokens. Delete one first." };
  const token = `ens_${randomBytes(24).toString("base64url")}`;
  await db.apiToken.create({ data: { userId: user.id, name: "MCP client", tokenHash: sha256(token) } });
  await audit("api_token_created", { userId: user.id });
  revalidatePath("/settings");
  return { token };
}

export async function deleteTokenAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = z.cuid().safeParse(form.get("id"));
  if (!id.success) return;
  await db.apiToken.deleteMany({ where: { id: id.data, userId: user.id } });
  await audit("api_token_deleted", { userId: user.id, target: id.data });
  revalidatePath("/settings");
}

export async function killSwitchAction(form: FormData): Promise<void> {
  const user = await requireUser();
  if (!isAdmin(user.email)) return;
  const on = form.get("on") === "on";
  await db.systemSetting.upsert({ where: { key: KILL_SWITCH_KEY }, create: { key: KILL_SWITCH_KEY, value: on ? "on" : "off" }, update: { value: on ? "on" : "off" } });
  await audit(on ? "kill_switch_on" : "kill_switch_off", { userId: user.id });
  revalidatePath("/admin");
}
