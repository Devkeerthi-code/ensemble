"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { answersSchema } from "@/lib/setup/answers";
import { TEMPLATE_VERSION } from "@/lib/setup/lines";
import { db } from "@/lib/server/db";
import { rateLimit } from "@/lib/server/rate-limit";
import { currentUser } from "@/lib/server/session";
import { audit, track } from "@/lib/server/telemetry";

type Result = { ok: true; id: string } | { ok: false; error: string };

const saveInput = z.object({ answers: answersSchema, id: z.cuid().optional() });

export async function saveSetupAction(input: unknown): Promise<Result> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Sign in to save setups." };
  const parsed = saveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Some answers are invalid. Go back and check them." };
  const limited = await rateLimit(`save:${user.id}`, 30, 60 * 60);
  if (!limited.ok) return { ok: false, error: "You're saving very often. Try again in a few minutes." };

  const { answers, id } = parsed.data;
  const data = { name: answers.projectName, answers, templateVersion: TEMPLATE_VERSION };
  if (id) {
    // updateMany with userId so one user can never overwrite another's setup.
    const res = await db.setupProfile.updateMany({ where: { id, userId: user.id }, data });
    if (res.count === 0) return { ok: false, error: "That setup no longer exists." };
    revalidatePath("/studio/saved");
    return { ok: true, id };
  }
  const created = await db.setupProfile.create({ data: { ...data, userId: user.id }, select: { id: true } });
  await Promise.all([track("setup_saved"), audit("setup_saved", { userId: user.id, target: created.id })]);
  revalidatePath("/studio/saved");
  return { ok: true, id: created.id };
}

export async function deleteSetupAction(form: FormData): Promise<void> {
  const user = await currentUser();
  const id = z.cuid().safeParse(form.get("id"));
  if (!user || !id.success) return;
  await db.setupProfile.deleteMany({ where: { id: id.data, userId: user.id } });
  await audit("setup_deleted", { userId: user.id, target: id.data });
  revalidatePath("/studio/saved");
}
