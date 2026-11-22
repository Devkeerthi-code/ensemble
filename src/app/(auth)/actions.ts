"use server";

import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { credentialsSchema, signIn, signOut } from "@/auth";
import { db } from "@/lib/server/db";
import { rateLimit } from "@/lib/server/rate-limit";
import { clientIp } from "@/lib/server/request";
import { audit, track } from "@/lib/server/telemetry";

export type AuthState = { error?: string; fieldErrors?: Partial<Record<"email" | "password", string>>; email?: string };

function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/studio";
}

async function signInOrError(email: string, password: string, redirectTo: string): Promise<AuthState> {
  try {
    await signIn("credentials", { email, password, redirectTo });
    return {};
  } catch (e) {
    if (e instanceof AuthError) return { error: "That email and password don't match. Try again, or wait 15 minutes after many attempts.", email };
    throw e;
  }
}

export async function signUpAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = credentialsSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  const email = String(form.get("email") ?? "");
  if (!parsed.success) {
    const fe = parsed.error.flatten().fieldErrors;
    return { fieldErrors: { email: fe.email?.[0], password: fe.password?.[0] }, email };
  }
  const limited = await rateLimit(`signup:${await clientIp()}`, 5, 60 * 60);
  if (!limited.ok) return { error: "Too many sign-ups from this network. Try again in an hour.", email };

  const existing = await db.user.findUnique({ where: { email: parsed.data.email }, select: { id: true } });
  if (existing) return { error: "An account with this email already exists. Sign in instead.", email };

  const user = await db.user.create({
    data: { email: parsed.data.email, passwordHash: await bcrypt.hash(parsed.data.password, 12) },
    select: { id: true },
  });
  await Promise.all([track("signup"), audit("signup", { userId: user.id })]);
  return signInOrError(parsed.data.email, parsed.data.password, safeNext(form.get("next")));
}

export async function signInAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = credentialsSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  const email = String(form.get("email") ?? "");
  if (!parsed.success) return { error: "Enter your email and a password of at least 8 characters.", email };
  return signInOrError(parsed.data.email, parsed.data.password, safeNext(form.get("next")));
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
