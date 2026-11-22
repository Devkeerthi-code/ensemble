import { generateText, Output } from "ai";
import { costUsd, estimateCostUsd, type Provider } from "@/lib/orchestrator/catalog";
import { planSchema, validateDag, type Plan } from "@/lib/orchestrator/dag";
import { languageModel } from "@/lib/orchestrator/ai-sdk-client";
import { checkBudget } from "@/lib/orchestrator/policy";
import { PLANNER_SYSTEM, plannerPrompt } from "@/lib/orchestrator/prompts";
import { route, type Preference } from "@/lib/orchestrator/routing";
import { DEFAULT_CONFIG } from "@/lib/orchestrator/engine";
import { prismaStore } from "./prisma-store";

export type PlanResult = { ok: true; plan: Plan; model: string; costUsd: number } | { ok: false; error: string };

/** The planner is itself an agent: routed like any task, budget-checked, and its plan validated as a DAG. */
export async function planGoal(input: { runId: string; userId: string; title: string; criteria: string; preference: Preference; budgetUsd: number }): Promise<PlanResult> {
  const creds = await prismaStore.credentials(input.userId);
  const pick = route({ skill: "analysis", preference: "quality", available: Object.keys(creds) as Provider[], scores: await prismaStore.scores() });
  if (!pick) return { ok: false, error: "No AI provider is set up. Add a key under Settings → Provider keys." };

  const prompt = plannerPrompt(input);
  const budget = checkBudget({
    estimateUsd: estimateCostUsd(pick.model, prompt.length + PLANNER_SYSTEM.length, 2500),
    runSpentUsd: 0,
    runCapUsd: input.budgetUsd,
    daySpentUsd: await prismaStore.daySpent(input.userId),
    dayCapUsd: DEFAULT_CONFIG.dayCapUsd,
    killSwitch: await prismaStore.killSwitch(),
  });
  if (!budget.ok) return { ok: false, error: budget.reason };

  let feedback = "";
  let spent = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await generateText({
        model: languageModel(pick.model.provider, pick.model.model, creds[pick.model.provider]),
        system: PLANNER_SYSTEM,
        prompt: prompt + feedback,
        output: Output.object({ schema: planSchema }),
        maxOutputTokens: 2500,
        maxRetries: 1,
        abortSignal: AbortSignal.timeout(90_000),
      });
      spent += costUsd(pick.model, result.usage.inputTokens ?? 0, result.usage.outputTokens ?? 0);
      const plan = result.output;
      const errors = validateDag(plan.tasks);
      if (errors.length === 0) {
        await prismaStore.addSpend(input.runId, input.userId, spent);
        return { ok: true, plan, model: pick.model.label, costUsd: spent };
      }
      feedback = `\n\nYour previous plan was invalid: ${errors.map((e) => e.message).join(" ")} Fix it.`;
    } catch (e) {
      feedback = `\n\nYour previous answer could not be used (${(e as Error).message.slice(0, 200)}). Return only the plan.`;
    }
  }
  await prismaStore.addSpend(input.runId, input.userId, spent);
  return { ok: false, error: `The planner (${pick.model.label}) couldn't produce a valid plan. You can write the tasks yourself below.` };
}
