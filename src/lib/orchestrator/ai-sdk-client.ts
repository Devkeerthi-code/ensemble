import { generateText, isStepCount, jsonSchema, tool, type LanguageModel, type ToolSet } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOllama } from "ollama-ai-provider-v2";
import type { Provider } from "./catalog";
import type { AgentTool, LlmCall, LlmClient, LlmResult } from "./llm";

const ollamaBase = () => process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/api";

/** One factory per provider, all behind the Vercel AI SDK's LanguageModel interface. */
export function languageModel(provider: Provider, model: string, apiKey: string | undefined): LanguageModel {
  switch (provider) {
    case "gemini":
      return createGoogle({ apiKey })(model);
    case "groq":
      return createGroq({ apiKey })(model);
    case "openrouter":
      return createOpenRouter({ apiKey })(model);
    case "anthropic":
      return createAnthropic({ apiKey })(model);
    case "openai":
      return createOpenAI({ apiKey })(model);
    case "ollama":
      return createOllama({ baseURL: ollamaBase() })(model);
  }
}

function toToolSet(tools: AgentTool[] = []): ToolSet {
  return Object.fromEntries(
    tools.map((t) => [t.name, tool({ description: t.description, inputSchema: jsonSchema(t.inputSchema), execute: async (args) => t.execute(args as Record<string, unknown>) })]),
  );
}

export const aiSdkClient: LlmClient = {
  async generate(call: LlmCall): Promise<LlmResult> {
    const started = Date.now();
    const result = await generateText({
      model: languageModel(call.model.provider, call.model.model, call.apiKey),
      system: call.system,
      prompt: call.prompt,
      maxOutputTokens: call.maxOutputTokens,
      tools: call.tools?.length ? toToolSet(call.tools) : undefined,
      stopWhen: isStepCount(call.tools?.length ? 6 : 1),
      maxRetries: 0,
      abortSignal: call.signal ?? AbortSignal.timeout(120_000),
    });
    return {
      text: result.text,
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
      latencyMs: Date.now() - started,
      toolCalls: result.steps.reduce((n, s) => n + s.toolCalls.length, 0),
    };
  },
};

const HEALTH_URL: Record<Provider, (key: string) => [string, RequestInit]> = {
  gemini: (k) => ["https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", { headers: { "x-goog-api-key": k } }],
  groq: (k) => ["https://api.groq.com/openai/v1/models", { headers: { authorization: `Bearer ${k}` } }],
  openrouter: (k) => ["https://openrouter.ai/api/v1/key", { headers: { authorization: `Bearer ${k}` } }],
  anthropic: (k) => ["https://api.anthropic.com/v1/models?limit=1", { headers: { "x-api-key": k, "anthropic-version": "2023-06-01" } }],
  openai: (k) => ["https://api.openai.com/v1/models", { headers: { authorization: `Bearer ${k}` } }],
  ollama: () => [`${ollamaBase().replace(/\/api$/, "")}/api/tags`, {}],
};

export type Health = { ok: boolean; latencyMs: number; detail: string };

/** Cheap authenticated call that costs no tokens. */
export async function checkHealth(provider: Provider, key: string): Promise<Health> {
  const started = Date.now();
  const [url, init] = HEALTH_URL[provider](key);
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(6000) });
    const latencyMs = Date.now() - started;
    if (res.ok) return { ok: true, latencyMs, detail: "Key works" };
    return { ok: false, latencyMs, detail: res.status === 401 || res.status === 403 ? "The provider rejected this key" : `Provider answered HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - started, detail: (e as Error).name === "TimeoutError" ? "No answer within 6 seconds" : "Could not reach the provider" };
  }
}
