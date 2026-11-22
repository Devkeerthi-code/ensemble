import type { ModelInfo, Provider } from "@/lib/orchestrator/catalog";
import type { PlanTask } from "@/lib/orchestrator/dag";
import { DEFAULT_CONFIG, type EngineConfig, type EngineDeps } from "@/lib/orchestrator/engine";
import type { LlmCall, LlmClient, LlmResult } from "@/lib/orchestrator/llm";
import { JUDGE_SYSTEM } from "@/lib/orchestrator/prompts";
import { ConcurrencyLimiter } from "@/lib/orchestrator/scheduler";
import { MemoryStore, type RunSnapshot } from "@/lib/orchestrator/store";

export const task = (key: string, dependsOn: string[] = [], extra: Partial<PlanTask> = {}): PlanTask => ({
  key,
  title: `Task ${key}`,
  skill: "writing",
  instructions: `Do the work for ${key} carefully.`,
  acceptance: "Clear and complete.",
  dependsOn,
  important: false,
  ...extra,
});

export function makeRun(tasks: PlanTask[], extra: Partial<RunSnapshot> = {}): RunSnapshot {
  return {
    id: extra.id ?? "run1",
    userId: "user1",
    status: "draft",
    priority: "normal",
    preference: "quality",
    budgetUsd: 5,
    spentUsd: 0,
    createdAt: new Date(0),
    goal: { title: "Test goal", criteria: "Works" },
    tasks: tasks.map((t, i) => ({ ...t, id: `t${i}`, status: "pending", attempts: 0, triedModels: [], costUsd: 0, inputTokens: 0, outputTokens: 0 })),
    ...extra,
  };
}

export type CallLog = Array<{ model: ModelInfo; judge: boolean; prompt: string; at: number; end: number }>;
type Behaviour = (call: LlmCall, n: number) => Partial<LlmResult> | Promise<Partial<LlmResult>>;

/** Fake LLM: optional latency, per-call behaviour, judge returns a fixed score unless overridden. */
export function fakeLlm(opts: { latencyMs?: number; behaviour?: Behaviour; judgeScore?: number | ((call: LlmCall) => number) } = {}): LlmClient & { calls: CallLog } {
  const calls: CallLog = [];
  let n = 0;
  return {
    calls,
    async generate(call) {
      const at = Date.now();
      const isJudge = call.system === JUDGE_SYSTEM;
      if (opts.latencyMs && !isJudge) await new Promise((r) => setTimeout(r, opts.latencyMs));
      const entry = { model: call.model, judge: isJudge, prompt: call.prompt, at, end: 0 };
      calls.push(entry);
      try {
        if (isJudge) {
          const score = typeof opts.judgeScore === "function" ? opts.judgeScore(call) : (opts.judgeScore ?? 9);
          return { text: JSON.stringify({ score, notes: "ok" }), inputTokens: 200, outputTokens: 30, latencyMs: 5, toolCalls: 0 };
        }
        const res = (await opts.behaviour?.(call, n++)) ?? {};
        return { text: `Result from ${call.model.model}`, inputTokens: 500, outputTokens: 400, latencyMs: opts.latencyMs ?? 1, toolCalls: 0, ...res };
      } finally {
        entry.end = Date.now();
      }
    },
  };
}

export function makeDeps(store: MemoryStore, llm: LlmClient, opts: { providers?: Provider[]; config?: Partial<EngineConfig>; perProvider?: number; perUser?: number } = {}): EngineDeps {
  const providers = opts.providers ?? ["groq", "gemini", "openrouter"];
  store.creds = Object.fromEntries(providers.map((p) => [p, `test-key-${p}`]));
  const perProvider = Object.fromEntries(providers.map((p) => [p, opts.perProvider ?? 3]));
  return {
    store,
    llm,
    limiter: new ConcurrencyLimiter({ perProvider, perUser: opts.perUser ?? 10 }),
    config: { ...DEFAULT_CONFIG, dayCapUsd: 10, approvalThresholdUsd: 10, useTools: false, ...opts.config },
  };
}
