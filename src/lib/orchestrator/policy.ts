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

/** Seconds from a Retry-After header (AI SDK APICallError exposes responseHeaders), as ms. */
export function retryAfterMs(e: unknown): number | undefined {
  const headers = (e as { responseHeaders?: Record<string, string> }).responseHeaders;
  const raw = headers?.["retry-after"] ?? headers?.["Retry-After"];
  const s = raw ? Number(raw) : NaN;
  return Number.isFinite(s) && s >= 0 ? Math.min(120_000, Math.ceil(s * 1000)) : undefined;
}

/** Provider errors can echo account or org ids. Keep the message, drop identifiers. */
export function scrubError(message: string): string {
  return message
    .replace(/\b(org|proj|user|acct)[_-][A-Za-z0-9]{6,}/g, "[id]")
    .replace(/\b(sk|gsk|AIza)[\w-]{10,}/g, "[key]")
    .slice(0, 300);
}

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
export function decideNext(input: { attempt: number; failure?: FailureKind; score?: number; sameModelRetries?: number; retryAfterMs?: number }, random = Math.random): NextStep {
  const { attempt, failure, score } = input;
  const wait = Math.max(backoffMs(attempt, random), input.retryAfterMs ?? 0);
  if (!failure && (score === undefined || score >= PASS_SCORE)) return { action: "accept" };
  // Rate limits clear with time, so they get two extra tries before giving up.
  if (attempt >= (failure === "rate_limit" ? MAX_ATTEMPTS + 2 : MAX_ATTEMPTS)) {
    return { action: "fail", reason: failure ? `Gave up after ${attempt} attempts (last error: ${failure.replace("_", " ")}).` : `Best score ${score}/10 after ${attempt} attempts, below the pass mark of ${PASS_SCORE}.` };
  }
  if (failure === "bad_request") return { action: "retry", switchModel: true, delayMs: 0, reason: "The provider rejected the request, so trying another model." };
  if (failure === "rate_limit" && (input.sameModelRetries ?? 0) === 0) {
    return { action: "retry", switchModel: false, delayMs: Math.max(wait, 5000), reason: "Rate limited. Waiting, then retrying the same model." };
  }
  if (failure) return { action: "retry", switchModel: true, delayMs: wait, reason: `${failure.replace("_", " ")}: failing over to a different provider.` };
  return { action: "retry", switchModel: true, delayMs: 0, reason: `Judge scored ${score}/10 (pass mark ${PASS_SCORE}). Retrying on a different model.` };
}

/** Token bucket per provider, refilled continuously. Counts requests, or tokens when given an amount. */
export class RateBucket {
  private tokens: number;
  private last: number;
  constructor(private perMinute: number, private now = () => Date.now()) {
    this.tokens = perMinute;
    this.last = now();
  }

  private refill(): void {
    const t = this.now();
    this.tokens = Math.min(this.perMinute, this.tokens + ((t - this.last) / 60_000) * this.perMinute);
    this.last = t;
  }

  /** Returns 0 and deducts if `amount` may go now, otherwise ms to wait (nothing deducted). Amounts above one minute's capacity are capped so they still run. */
  take(amount = 1): number {
    this.refill();
    const need = Math.min(amount, this.perMinute);
    if (this.tokens >= need) {
      this.tokens -= need;
      return 0;
    }
    return Math.ceil(((need - this.tokens) / this.perMinute) * 60_000);
  }

  /** Gives back part of a reservation, e.g. when a call used fewer tokens than estimated. */
  refund(amount: number): void {
    this.refill();
    this.tokens = Math.min(this.perMinute, this.tokens + Math.max(0, amount));
  }
}
