import type { Skill } from "./dag";

export const PROVIDERS = ["gemini", "groq", "openrouter", "anthropic", "openai", "ollama"] as const;
export type Provider = (typeof PROVIDERS)[number];

export const PROVIDER_LABELS: Record<Provider, string> = {
  gemini: "Google Gemini",
  groq: "Groq",
  openrouter: "OpenRouter",
  anthropic: "Anthropic",
  openai: "OpenAI",
  ollama: "Ollama (local)",
};

/** Requests per minute and parallel calls Ensemble allows per provider, kept under typical free-tier limits. */
export const PROVIDER_LIMITS: Record<Provider, { rpm: number; concurrency: number }> = {
  gemini: { rpm: 10, concurrency: 3 },
  groq: { rpm: 30, concurrency: 4 },
  openrouter: { rpm: 20, concurrency: 3 },
  anthropic: { rpm: 50, concurrency: 4 },
  openai: { rpm: 60, concurrency: 4 },
  ollama: { rpm: 120, concurrency: 1 },
};

export type ModelInfo = {
  provider: Provider;
  model: string;
  label: string;
  /** USD per million tokens. Approximate list prices, checked 2026-11-22 via provider/OpenRouter model lists. */
  inputPerM: number;
  outputPerM: number;
  /** Typical seconds for a ~800-token answer; a prior until Ensemble has measurements. */
  latencyS: number;
  /** Prior quality 0..1 per skill, from public benchmarks and our own testing. Replaced by measured judge scores over time. */
  skills: Record<Skill, number>;
};

const s = (research: number, writing: number, coding: number, analysis: number, summarising: number, checking: number): Record<Skill, number> => ({ research, writing, coding, analysis, summarising, checking });

export const MODELS: ModelInfo[] = [
  { provider: "gemini", model: "gemini-3.8-flash", label: "Gemini 3.8 Flash", inputPerM: 0.83, outputPerM: 4.13, latencyS: 6, skills: s(0.86, 0.82, 0.8, 0.84, 0.86, 0.8) },
  { provider: "gemini", model: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite", inputPerM: 0.3, outputPerM: 2.5, latencyS: 3, skills: s(0.72, 0.7, 0.62, 0.68, 0.8, 0.7) },
  { provider: "groq", model: "openai/gpt-oss-120b", label: "gpt-oss-120b on Groq", inputPerM: 0.09, outputPerM: 0.36, latencyS: 2, skills: s(0.74, 0.72, 0.78, 0.78, 0.76, 0.76) },
  { provider: "groq", model: "openai/gpt-oss-20b", label: "gpt-oss-20b on Groq", inputPerM: 0.07, outputPerM: 0.3, latencyS: 1, skills: s(0.62, 0.64, 0.66, 0.64, 0.7, 0.66) },
  { provider: "groq", model: "qwen/qwen3.8-27b", label: "Qwen 3.8 27B on Groq", inputPerM: 0.04, outputPerM: 1.5, latencyS: 2, skills: s(0.7, 0.72, 0.76, 0.74, 0.74, 0.72) },
  { provider: "openrouter", model: "deepseek/deepseek-v4.1-flash-1017", label: "DeepSeek V4.1 Flash", inputPerM: 0.15, outputPerM: 0.6, latencyS: 5, skills: s(0.76, 0.76, 0.84, 0.82, 0.78, 0.8) },
  { provider: "openrouter", model: "google/gemma-4-31b-it:free", label: "Gemma 4 31B (free)", inputPerM: 0, outputPerM: 0, latencyS: 8, skills: s(0.6, 0.64, 0.58, 0.6, 0.7, 0.6) },
  { provider: "anthropic", model: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", inputPerM: 2, outputPerM: 10, latencyS: 7, skills: s(0.9, 0.93, 0.94, 0.92, 0.9, 0.93) },
  { provider: "anthropic", model: "claude-haiku-5-5", label: "Claude Haiku 5.5", inputPerM: 0.1, outputPerM: 0.5, latencyS: 3, skills: s(0.78, 0.82, 0.82, 0.8, 0.84, 0.82) },
  { provider: "openai", model: "gpt-5.4-mini", label: "GPT-5.4 mini", inputPerM: 0.75, outputPerM: 4.5, latencyS: 5, skills: s(0.84, 0.84, 0.86, 0.86, 0.84, 0.86) },
  { provider: "openai", model: "gpt-5.4-nano", label: "GPT-5.4 nano", inputPerM: 0.2, outputPerM: 1.25, latencyS: 2, skills: s(0.66, 0.68, 0.68, 0.66, 0.74, 0.7) },
  { provider: "ollama", model: process.env.OLLAMA_MODEL ?? "llama3.2", label: "Local model (Ollama)", inputPerM: 0, outputPerM: 0, latencyS: 12, skills: s(0.5, 0.56, 0.5, 0.5, 0.6, 0.5) },
];

export const modelId = (m: Pick<ModelInfo, "provider" | "model">) => `${m.provider}:${m.model}`;

export function findModel(provider: string, model: string): ModelInfo | undefined {
  return MODELS.find((m) => m.provider === provider && m.model === model);
}

export function costUsd(m: Pick<ModelInfo, "inputPerM" | "outputPerM">, inputTokens: number, outputTokens: number): number {
  return (inputTokens * m.inputPerM + outputTokens * m.outputPerM) / 1_000_000;
}

/** Rough upper bound before a call: ~4 characters per token, plus the full output allowance. */
export function estimateCostUsd(m: ModelInfo, promptChars: number, maxOutputTokens: number): number {
  return costUsd(m, Math.ceil(promptChars / 4), maxOutputTokens);
}
