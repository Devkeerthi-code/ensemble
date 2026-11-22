import { PROVIDERS, type Provider } from "@/lib/orchestrator/catalog";
import { open, seal } from "@/lib/orchestrator/crypto";
import { db } from "../db";

/** Server-provided keys from .env. Users' own keys always take precedence. */
const ENV_KEYS: Record<Provider, string | undefined> = {
  gemini: process.env.GEMINI_API_KEY,
  groq: process.env.GROQ_API_KEY,
  openrouter: process.env.OPENROUTER_API_KEY,
  anthropic: process.env.ANTHROPIC_API_KEY,
  openai: process.env.OPENAI_API_KEY,
  ollama: process.env.OLLAMA_BASE_URL ? "local" : undefined,
};

const aad = (userId: string, provider: Provider) => `${userId}:${provider}`;

export async function saveProviderKey(userId: string, provider: Provider, plaintext: string): Promise<void> {
  const sealed = seal(plaintext, aad(userId, provider));
  const last4 = plaintext.slice(-4);
  await db.providerKey.upsert({
    where: { userId_provider: { userId, provider } },
    create: { userId, provider, ...sealed, last4 },
    update: { ...sealed, last4 },
  });
}

export async function deleteProviderKey(userId: string, provider: Provider): Promise<void> {
  await db.providerKey.deleteMany({ where: { userId, provider } });
}

/** Safe to show in the browser: never includes the key, only the last four characters. */
export async function listProviderKeys(userId: string) {
  const rows = await db.providerKey.findMany({ where: { userId }, select: { provider: true, last4: true, updatedAt: true } });
  return PROVIDERS.map((p) => {
    const row = rows.find((r) => r.provider === p);
    return { provider: p, own: row ? { last4: row.last4, updatedAt: row.updatedAt } : null, serverKey: Boolean(ENV_KEYS[p]) };
  });
}

export async function credentialsFor(userId: string): Promise<Partial<Record<Provider, string>>> {
  const rows = await db.providerKey.findMany({ where: { userId } });
  const out: Partial<Record<Provider, string>> = {};
  for (const p of PROVIDERS) if (ENV_KEYS[p]) out[p] = ENV_KEYS[p];
  for (const r of rows) {
    try {
      out[r.provider] = open({ ciphertext: r.ciphertext, iv: r.iv, tag: r.tag }, aad(userId, r.provider));
    } catch {
      // Key rotated or row tampered with: skip it rather than leak an error with key material.
    }
  }
  return out;
}

export async function keyFor(userId: string, provider: Provider): Promise<string | undefined> {
  return (await credentialsFor(userId))[provider];
}
