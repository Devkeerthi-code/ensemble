import { MODELS, costUsd, modelId, type ModelInfo, type Provider } from "./catalog";
import type { Skill } from "./dag";

export type Preference = "quality" | "speed" | "cost";
export type MeasuredScore = { provider: string; model: string; skill: Skill; samples: number; quality: number; latencyMs: number; costUsd: number };

export type RouteDecision = {
  model: ModelInfo;
  reason: string;
  ranked: Array<{ id: string; total: number; quality: number; speed: number; cheapness: number }>;
  /** Every candidate with its score, best first, for spill-over when the best provider is busy. */
  alternatives: Array<{ model: ModelInfo; total: number }>;
};

const WEIGHTS: Record<Preference, { quality: number; speed: number; cheapness: number }> = {
  quality: { quality: 0.9, speed: 0.05, cheapness: 0.05 },
  speed: { quality: 0.35, speed: 0.5, cheapness: 0.15 },
  cost: { quality: 0.35, speed: 0.1, cheapness: 0.55 },
};

/** How many judged samples it takes before measurements outweigh the prior. */
const PRIOR_WEIGHT = 5;
const TYPICAL_OUTPUT = 800;
const TYPICAL_INPUT = 1500;

function blend(prior: number, measured: number | undefined, samples: number): number {
  if (measured === undefined || samples === 0) return prior;
  return (prior * PRIOR_WEIGHT + measured * samples) / (PRIOR_WEIGHT + samples);
}

export type RouteInput = {
  skill: Skill;
  preference: Preference;
  available: Provider[];
  exclude?: string[];
  scores?: MeasuredScore[];
  models?: ModelInfo[];
};

/**
 * Picks the best model for a skill. Quality blends the capability table with Ensemble's judge
 * scores; speed and cheapness are normalised 0..1 against the other candidates.
 */
export function route({ skill, preference, available, exclude = [], scores = [], models = MODELS }: RouteInput): RouteDecision | null {
  const pool = models.filter((m) => available.includes(m.provider) && !exclude.includes(modelId(m)));
  if (pool.length === 0) return null;

  const measured = (m: ModelInfo) => scores.find((x) => x.provider === m.provider && x.model === m.model && x.skill === skill);
  const latency = (m: ModelInfo) => {
    const ms = measured(m);
    return blend(m.latencyS, ms ? ms.latencyMs / 1000 : undefined, ms?.samples ?? 0);
  };
  const cost = (m: ModelInfo) => costUsd(m, TYPICAL_INPUT, TYPICAL_OUTPUT);
  const maxLat = Math.max(...pool.map(latency));
  const maxCost = Math.max(...pool.map(cost));
  const w = WEIGHTS[preference];

  const ranked = pool
    .map((m) => {
      const ms = measured(m);
      const quality = blend(m.skills[skill], ms ? ms.quality / 10 : undefined, ms?.samples ?? 0);
      const speed = maxLat > 0 ? 1 - latency(m) / maxLat : 1;
      const cheapness = maxCost > 0 ? 1 - cost(m) / maxCost : 1;
      return { m, id: modelId(m), quality, speed, cheapness, total: w.quality * quality + w.speed * speed + w.cheapness * cheapness, samples: ms?.samples ?? 0 };
    })
    .sort((a, b) => b.total - a.total || a.id.localeCompare(b.id));

  const best = ranked[0]!;
  const runnerUp = ranked[1];
  const basis = best.samples > 0 ? `${best.samples} judged result${best.samples === 1 ? "" : "s"} plus the capability table` : "the capability table (no measurements yet)";
  const reason =
    `${best.m.label} scored highest for ${skill} with a ${preference} preference: quality ${best.quality.toFixed(2)}, ` +
    `speed ${best.speed.toFixed(2)}, cheapness ${best.cheapness.toFixed(2)}, based on ${basis}.` +
    (runnerUp ? ` Next best: ${runnerUp.m.label} (${runnerUp.total.toFixed(2)} vs ${best.total.toFixed(2)}).` : "") +
    (exclude.length ? ` Skipped after earlier attempts: ${exclude.join(", ")}.` : "");

  return { model: best.m, reason, alternatives: ranked.slice(1).map((x) => ({ model: x.m, total: x.total })), ranked: ranked.map(({ id, total, quality, speed, cheapness }) => ({ id, total, quality, speed, cheapness })) };
}

/** Exponential moving average so recent behaviour counts, but one bad answer doesn't sink a model. */
export function updateScore(prev: MeasuredScore | undefined, sample: { quality: number; latencyMs: number; costUsd: number }, key: Omit<MeasuredScore, "samples" | "quality" | "latencyMs" | "costUsd">): MeasuredScore {
  if (!prev || prev.samples === 0) return { ...key, samples: 1, ...sample };
  const a = Math.max(0.1, 1 / (prev.samples + 1));
  const mix = (old: number, next: number) => old + a * (next - old);
  return { ...key, samples: prev.samples + 1, quality: mix(prev.quality, sample.quality), latencyMs: mix(prev.latencyMs, sample.latencyMs), costUsd: mix(prev.costUsd, sample.costUsd) };
}
