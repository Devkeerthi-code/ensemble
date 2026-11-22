/** Budget, retry and approval rules. Pure functions so every rule is unit-tested. */

export const MAX_ATTEMPTS = 3;
export const PASS_SCORE = 7;

export type BudgetCheck = { ok: true } | { ok: false; reason: string };

export function checkBudget(input: { estimateUsd: number; runSpentUsd: number; runCapUsd: number; daySpentUsd: number; dayCapUsd: number; killSwitch: boolean }): BudgetCheck {
  const { estimateUsd, runSpentUsd, runCapUsd, daySpentUsd, dayCapUsd, killSwitch } = input;
  if (killSwitch) return { ok: false, reason: "The global kill switch is on. No model calls are allowed until an admin turns it off." };
  if (runSpentUsd + estimateUsd > runCapUsd) {
    return { ok: false, reason: `This call could cost up to $${estimateUsd.toFixed(4)}, which would pass the run's $${runCapUsd.toFixed(2)} cap ($${runSpentUsd.toFixed(4)} spent).` };
  }
  if (daySpentUsd + estimateUsd > dayCapUsd) {
    return { ok: false, reason: `This call would pass your daily cap of $${dayCapUsd.toFixed(2)} ($${daySpentUsd.toFixed(4)} spent today).` };
  }
  return { ok: true };
}

export type ApprovalKind = "spend" | "external_effect";

/** Anything with effects outside Ensemble, or a single call above the threshold, waits for a human. */
export function needsApproval(input: { estimateUsd: number; thresholdUsd: number; externalEffect: boolean; alreadyApproved: boolean }): ApprovalKind | null {
  if (input.alreadyApproved) return null;
  if (input.externalEffect) return "external_effect";
  if (input.estimateUsd > input.thresholdUsd) return "spend";
  return null;
}

export type FailureKind = "rate_limit" | "provider_error" | "timeout" | "bad_request" | "judge_failed";

export function classifyError(e: unknown): FailureKind {
  const err = e as { statusCode?: number; status?: number; name?: string; message?: string };
  const status = err.statusCode ?? err.status;
  if (status === 429 || /rate.?limit|quota/i.test(err.message ?? "")) return "rate_limit";
  if (err.name === "AbortError" || err.name === "TimeoutError" || /timed? ?out/i.test(err.message ?? "")) return "timeout";
  if (status && status >= 400 && status < 500 && status !== 408) return "bad_request";
  return "provider_error";
}

export type NextStep =
  | { action: "accept" }
  | { action: "retry"; switchModel: boolean; delayMs: number; reason: string }
  | { action: "fail"; reason: string };

/** Exponential backoff with full jitter, capped at 30s. `random` is injectable for tests. */
export function backoffMs(attempt: number, random = Math.random): number {
  const cap = Math.min(30_000, 1000 * 2 ** (attempt - 1));
  return Math.round(cap / 2 + (random() * cap) / 2);
}

/**
 * After an attempt: rate limits retry the same model after backoff (once), other failures and
 * failed judgements move to a different model. Never more than MAX_ATTEMPTS.
 */
export function decideNext(input: { attempt: number; failure?: FailureKind; score?: number; sameModelRetries?: number }, random = Math.random): NextStep {
  const { attempt, failure, score } = input;
  if (!failure && (score === undefined || score >= PASS_SCORE)) return { action: "accept" };
  if (attempt >= MAX_ATTEMPTS) {
    return { action: "fail", reason: failure ? `Gave up after ${attempt} attempts (last error: ${failure.replace("_", " ")}).` : `Best score ${score}/10 after ${attempt} attempts, below the pass mark of ${PASS_SCORE}.` };
  }
  if (failure === "bad_request") return { action: "retry", switchModel: true, delayMs: 0, reason: "The provider rejected the request, so trying another model." };
  if (failure === "rate_limit" && (input.sameModelRetries ?? 0) === 0) {
    return { action: "retry", switchModel: false, delayMs: backoffMs(attempt, random), reason: "Rate limited. Waiting, then retrying the same model." };
  }
  if (failure) return { action: "retry", switchModel: true, delayMs: backoffMs(attempt, random), reason: `${failure.replace("_", " ")}: failing over to a different provider.` };
  return { action: "retry", switchModel: true, delayMs: 0, reason: `Judge scored ${score}/10 (pass mark ${PASS_SCORE}). Retrying on a different model.` };
}

/** Token bucket per provider, refilled continuously. */
export class RateBucket {
  private tokens: number;
  private last: number;
  constructor(private perMinute: number, private now = () => Date.now()) {
    this.tokens = perMinute;
    this.last = now();
  }
  /** Returns 0 if a request may go now, otherwise ms to wait. */
  take(): number {
    const t = this.now();
    this.tokens = Math.min(this.perMinute, this.tokens + ((t - this.last) / 60_000) * this.perMinute);
    this.last = t;
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return 0;
    }
    return Math.ceil(((1 - this.tokens) / this.perMinute) * 60_000);
  }
}
