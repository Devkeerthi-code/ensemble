import type { ModelInfo } from "./catalog";

/** JSON-schema tool, independent of any SDK, so tests can drive tools without a real model. */
export type AgentTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<string>;
};

export type LlmCall = {
  model: ModelInfo;
  system: string;
  prompt: string;
  maxOutputTokens: number;
  tools?: AgentTool[];
  apiKey?: string;
  signal?: AbortSignal;
};

export type LlmResult = { text: string; inputTokens: number; outputTokens: number; latencyMs: number; toolCalls: number };

export interface LlmClient {
  generate(call: LlmCall): Promise<LlmResult>;
}
