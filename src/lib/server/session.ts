import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

export type SessionUser = { id: string; email: string };

export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth();
  const id = session?.user?.id;
  const email = session?.user?.email;
  return id && email ? { id, email } : null;
}

/** For pages and actions that need a signed-in user. Every DB query below it filters by this id. */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export function isAdmin(email: string): boolean {
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return admins.includes(email.toLowerCase());
}
