"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { rateLimit } from "@/lib/server/rate-limit";
import { requireUser } from "@/lib/server/session";
import { createFromRun, createFromTemplate, deleteWorkflow, duplicateWorkflow, ownedWorkflow, rotateWebhookToken, setEnabled, startWorkflowRun, updateSettings, workflowSettingsSchema } from "@/lib/server/automation/workflows";
import { findTemplate } from "@/lib/automation/templates";

export type WorkflowFormState = { error?: string };
const id = z.cuid();

/** Form fields: template, name, budgetUsd, priority, preference, schedule, deliveryUrl, plus one field per template input ("in_<name>"). */
export async function createFromTemplateAction(_prev: WorkflowFormState, form: FormData): Promise<WorkflowFormState> {
  const user = await requireUser();
  const tpl = findTemplate(String(form.get("template") ?? ""));
  if (!tpl) return { error: "Pick a template" };
  const settings = workflowSettingsSchema.safeParse(Object.fromEntries(form));
  if (!settings.success) return { error: settings.error.issues[0]?.message ?? "Check the settings" };
  const limited = await rateLimit(`wf-create:${user.id}`, 30, 60 * 60);
  if (!limited.ok) return { error: "Too many workflows created this hour." };
  const inputs = Object.fromEntries(tpl.inputs.map((i) => [i.name, String(form.get(`in_${i.name}`) ?? "")]));
  const res = await createFromTemplate(user.id, tpl.id, inputs, settings.data);
  if (!res.ok) return { error: res.error };
  redirect(`/workflows/${res.id}`);
}

export async function saveRunAsWorkflowAction(runId: string, name: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!id.safeParse(runId).success) return { ok: false, error: "Bad run id" };
  const res = await createFromRun(user.id, runId, name.trim().slice(0, 80) || "Saved workflow");
  if (!res.ok) return { ok: false, error: res.error };
  redirect(`/workflows/${res.id}`);
}

export async function updateWorkflowAction(workflowId: string, _prev: WorkflowFormState, form: FormData): Promise<WorkflowFormState> {
  const user = await requireUser();
  if (!id.safeParse(workflowId).success) return { error: "Bad workflow id" };
  const settings = workflowSettingsSchema.safeParse(Object.fromEntries(form));
  if (!settings.success) return { error: settings.error.issues[0]?.message ?? "Check the settings" };
  const res = await updateSettings(user.id, workflowId, settings.data);
  revalidatePath(`/workflows/${workflowId}`);
  return res.ok ? {} : { error: res.error };
}

export async function runWorkflowNowAction(workflowId: string): Promise<{ ok: boolean; error?: string; runId?: string }> {
  const user = await requireUser();
  if (!id.safeParse(workflowId).success) return { ok: false, error: "Bad workflow id" };
  const limited = await rateLimit(`wf-run:${user.id}`, 30, 60 * 60);
  if (!limited.ok) return { ok: false, error: "Too many runs started this hour." };
  const wf = await ownedWorkflow(user.id, workflowId);
  if (!wf) return { ok: false, error: "Workflow not found" };
  const res = await startWorkflowRun(wf, "manual");
  revalidatePath(`/workflows/${workflowId}`);
  return res;
}

export async function duplicateWorkflowAction(workflowId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!id.safeParse(workflowId).success) return { ok: false, error: "Bad workflow id" };
  const limited = await rateLimit(`wf-create:${user.id}`, 30, 60 * 60);
  if (!limited.ok) return { ok: false, error: "Too many workflows created this hour." };
  const res = await duplicateWorkflow(user.id, workflowId);
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/workflows");
  redirect(`/workflows/${res.id}`);
}

export async function toggleWorkflowAction(workflowId: string, enabled: boolean): Promise<{ ok: boolean }> {
  const user = await requireUser();
  if (!id.safeParse(workflowId).success) return { ok: false };
  const ok = await setEnabled(user.id, workflowId, enabled);
  revalidatePath(`/workflows/${workflowId}`);
  revalidatePath("/workflows");
  return { ok };
}

/** Returns the new token once; the caller must show it immediately. */
export async function rotateWebhookAction(workflowId: string): Promise<{ token?: string; error?: string }> {
  const user = await requireUser();
  if (!id.safeParse(workflowId).success) return { error: "Bad workflow id" };
  const token = await rotateWebhookToken(user.id, workflowId);
  return token ? { token } : { error: "Workflow not found" };
}

export async function deleteWorkflowAction(workflowId: string): Promise<void> {
  const user = await requireUser();
  if (!id.safeParse(workflowId).success) return;
  await deleteWorkflow(user.id, workflowId);
  redirect("/workflows");
}
