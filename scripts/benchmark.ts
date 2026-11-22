import "dotenv/config";
import type { Provider } from "../src/lib/orchestrator/catalog";
import type { PlanTask } from "../src/lib/orchestrator/dag";
import { DEFAULT_CONFIG, type EngineDeps } from "../src/lib/orchestrator/engine";
import type { LlmClient } from "../src/lib/orchestrator/llm";
import { runInMemory } from "../src/lib/orchestrator/memory-runner";
import { JUDGE_SYSTEM } from "../src/lib/orchestrator/prompts";
import { ConcurrencyLimiter } from "../src/lib/orchestrator/scheduler";
import { MemoryStore, type RunSnapshot } from "../src/lib/orchestrator/store";

/**
 * 10 tasks, 4 parallel branches: four research → summarise pairs, then compare, then write.
 *   npm run bench            simulated latency from the capability table (free, deterministic)
 *   npm run bench -- --live  real calls to the providers in .env (costs a few cents at most)
 */
const live = process.argv.includes("--live");
const topics = ["Vercel", "Netlify", "Render", "Cloudflare Pages"];
const t = (key: string, skill: PlanTask["skill"], title: string, dependsOn: string[] = []): PlanTask => ({
  key, skill, title, dependsOn, important: false,
  instructions: `${title}. Keep it under 120 words. Focus on free-tier limits for a student project.`,
  acceptance: "Accurate, specific, under 120 words.",
});
const plan: PlanTask[] = [
  ...topics.flatMap((name, i) => [t(`research-${i}`, "research", `Research ${name}'s free hosting tier`), t(`summary-${i}`, "summarising", `Summarise ${name} in 3 bullets`, [`research-${i}`])]),
  t("compare", "analysis", "Compare the four hosts in a table", topics.map((_, i) => `summary-${i}`)),
  t("write", "writing", "Write a 150-word recommendation for a college club", ["compare"]),
];

function simulated(): LlmClient {
  return {
    async generate(call) {
      const judge = call.system === JUDGE_SYSTEM;
      const ms = judge ? 150 : call.model.latencyS * 200;
      await new Promise((r) => setTimeout(r, ms));
      return judge
        ? { text: '{"score": 8, "notes": "simulated"}', inputTokens: 300, outputTokens: 30, latencyMs: ms, toolCalls: 0 }
        : { text: `Simulated answer for: ${call.prompt.split("\n").find((l) => l.startsWith("TASK:"))}`, inputTokens: 700, outputTokens: 350, latencyMs: ms, toolCalls: 0 };
    },
  };
}

async function once(concurrency: number, llm: LlmClient, providers: Provider[]) {
  const store = new MemoryStore();
  const run: RunSnapshot = {
    id: `bench-${concurrency}`, userId: "bench", status: "draft", priority: "normal", preference: (process.argv.includes("--quality") ? "quality" : "speed") as "quality" | "speed", budgetUsd: 1, spentUsd: 0, createdAt: new Date(),
    goal: { title: "Pick a free host for our college club website", criteria: "A clear recommendation with reasons" },
    tasks: plan.map((p, i) => ({ ...p, id: `t${i}`, status: "pending", attempts: 0, triedModels: [], costUsd: 0, inputTokens: 0, outputTokens: 0 })),
  };
  store.add(run);
  store.creds = Object.fromEntries(providers.map((p) => [p, process.env[`${p.toUpperCase()}_API_KEY`] ?? "sim"]));
  const deps: EngineDeps = {
    store, llm,
    limiter: new ConcurrencyLimiter({ perProvider: Object.fromEntries(providers.map((p) => [p, concurrency])), perUser: concurrency }),
    config: { ...DEFAULT_CONFIG, dayCapUsd: 1, approvalThresholdUsd: 1, useTools: live, maxOutputTokens: 1500 },
  };
  const started = Date.now();
  await runInMemory(deps, run.id, { concurrency });
  const done = (await store.loadRun(run.id))!;
  for (const x of done.tasks.filter((y) => y.status !== "done")) console.log(`  ${x.key}: ${x.status} after ${x.attempts} attempts. ${x.error ?? ""}`);
  for (const e of store.events.filter((y) => y.type === "retry")) console.log(`  retry ${String(e.payload.key)}: ${String(e.payload.reason)} ${String(e.payload.errorText ?? "").slice(0, 160)}`);
  return { seconds: (Date.now() - started) / 1000, costUsd: done.spentUsd, status: done.status, models: [...new Set(done.tasks.map((x) => x.model))].join(", ") };
}

async function main() {
  const providers: Provider[] = live ? (["groq", "gemini", "openrouter"] as Provider[]).filter((p) => process.env[`${p.toUpperCase()}_API_KEY`]) : ["groq", "gemini", "openrouter"];
  const llm = live ? (await import("../src/lib/orchestrator/ai-sdk-client")).aiSdkClient : simulated();
  console.log(`Mode: ${live ? "live providers" : "simulated latency"} · providers: ${providers.join(", ")} · 10 tasks, 4 parallel branches`);
  const sequential = await once(1, llm, providers);
  const parallel = await once(4, llm, providers);
  console.log(`One by one : ${sequential.seconds.toFixed(1)} s, $${sequential.costUsd.toFixed(5)}, ${sequential.status}`);
  console.log(`Parallel(4): ${parallel.seconds.toFixed(1)} s, $${parallel.costUsd.toFixed(5)}, ${parallel.status}`);
  console.log(`Speed-up   : ${(sequential.seconds / parallel.seconds).toFixed(2)}x · models used: ${parallel.models}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
