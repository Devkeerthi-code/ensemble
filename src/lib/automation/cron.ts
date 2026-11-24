/**
 * Minimal 5-field cron (minute hour day-of-month month day-of-week), evaluated in UTC.
 * Supports *, numbers, lists (1,15), ranges (1-5) and steps (*\/15, 8-18/2). Day-of-week 0 or 7 is Sunday.
 * Shortcuts @hourly, @daily, @weekly, @monthly and @yearly are expanded to their 5-field form.
 * Months and weekdays also accept English abbreviations (JAN-DEC, SUN-SAT), in any case.
 */
type Field = { min: number; max: number; names?: string[] };
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const FIELDS: Field[] = [
  { min: 0, max: 59 },
  { min: 0, max: 23 },
  { min: 1, max: 31 },
  { min: 1, max: 12, names: MONTHS },
  { min: 0, max: 7, names: WEEKDAYS },
];

/** Swaps name abbreviations for their numbers, e.g. MON-FRI -> 1-5, JAN -> 1. */
function withNumbers(part: string, f: Field): string {
  if (!f.names) return part;
  return part.toUpperCase().replace(/[A-Z]{3}/g, (n) => {
    const i = f.names!.indexOf(n);
    if (i < 0) throw new Error(`"${n}" is not a valid name here`);
    return String(i + f.min);
  });
}

export type Cron = { sets: Array<Set<number>>; domAny: boolean; dowAny: boolean };

function parseField(part: string, f: Field): Set<number> {
  const out = new Set<number>();
  for (const item of withNumbers(part, f).split(",")) {
    const m = item.match(/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/);
    if (!m) throw new Error(`"${item}" is not a valid cron value`);
    const step = m[2] ? Number(m[2]) : 1;
    if (step < 1) throw new Error("Step must be at least 1");
    const [lo, rawHi] = m[1] === "*" ? [f.min, f.max] : (m[1]!.split("-").map(Number) as [number, number?]);
    const hi = rawHi ?? (m[2] ? f.max : lo);
    if (lo < f.min || hi > f.max || lo > hi) throw new Error(`"${item}" is out of range ${f.min}-${f.max}`);
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

const MACROS: Record<string, string> = {
  "@hourly": "0 * * * *",
  "@daily": "0 0 * * *",
  "@weekly": "0 0 * * 0",
  "@monthly": "0 0 1 * *",
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
};

export function parseCron(expr: string): Cron {
  const trimmed = expr.trim();
  const parts = (MACROS[trimmed.toLowerCase()] ?? trimmed).split(/\s+/);
  if (parts.length !== 5) throw new Error("Use 5 fields: minute hour day month weekday");
  const sets = parts.map((p, i) => parseField(p, FIELDS[i]!));
  if (sets[4]!.has(7)) sets[4]!.add(0);
  return { sets, domAny: parts[2] === "*", dowAny: parts[4] === "*" };
}

function matches(c: Cron, d: Date): boolean {
  const [mi, h, dom, mon, dow] = c.sets as [Set<number>, Set<number>, Set<number>, Set<number>, Set<number>];
  if (!mi.has(d.getUTCMinutes()) || !h.has(d.getUTCHours()) || !mon.has(d.getUTCMonth() + 1)) return false;
  const domOk = dom.has(d.getUTCDate());
  const dowOk = dow.has(d.getUTCDay());
  // Standard cron: if both day fields are restricted, either may match.
  if (c.domAny && c.dowAny) return true;
  if (c.domAny) return dowOk;
  if (c.dowAny) return domOk;
  return domOk || dowOk;
}

/** Next matching minute strictly after `from`. Throws if nothing matches within ~4 years (e.g. 31 Feb). */
export function nextRun(expr: string, from: Date): Date {
  const c = parseCron(expr);
  const d = new Date(Math.floor(from.getTime() / 60_000) * 60_000 + 60_000);
  for (let i = 0; i < 2_200_000; i++) {
    if (!c.sets[3]!.has(d.getUTCMonth() + 1)) {
      d.setUTCMonth(d.getUTCMonth() + 1, 1);
      d.setUTCHours(0, 0, 0, 0);
      continue;
    }
    if (matches(c, d)) return d;
    if (!c.sets[1]!.has(d.getUTCHours())) d.setUTCHours(d.getUTCHours() + 1, 0, 0, 0);
    else d.setUTCMinutes(d.getUTCMinutes() + 1);
  }
  throw new Error("This schedule never runs");
}

export const SCHEDULE_PRESETS = [
  { label: "Every day at 09:00 UTC", cron: "0 9 * * *" },
  { label: "Weekdays at 08:30 UTC", cron: "30 8 * * 1-5" },
  { label: "Every Monday at 07:00 UTC", cron: "0 7 * * 1" },
  { label: "Every 6 hours", cron: "0 */6 * * *" },
] as const;

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const pad = (n: number) => String(n).padStart(2, "0");
const only = (set: Set<number>) => (set.size === 1 ? [...set][0]! : undefined);

function describeDays(c: Cron): string | undefined {
  const [, , dom, mon, dow] = c.sets as [Set<number>, Set<number>, Set<number>, Set<number>, Set<number>];
  if (mon.size !== 12) return undefined;
  if (c.domAny && c.dowAny) return "Every day";
  if (c.dowAny) return only(dom) !== undefined ? `On day ${only(dom)} of every month` : undefined;
  if (!c.domAny) return undefined;
  const days = [...new Set([...dow].map((d) => d % 7))].sort();
  if (days.join() === "1,2,3,4,5") return "Weekdays";
  if (days.join() === "0,6") return "Weekends";
  return days.length <= 3 ? `Every ${days.map((d) => DAY_NAMES[d]).join(", ")}` : undefined;
}

/** Short plain-English description for the UI; falls back to the raw expression for unusual shapes. */
export function describeCron(expr: string): string {
  const preset = SCHEDULE_PRESETS.find((p) => p.cron === expr)?.label;
  if (preset) return preset;
  const fallback = `Cron "${expr}" (UTC)`;
  let c: Cron;
  try {
    c = parseCron(expr);
  } catch {
    return fallback;
  }
  const [mi, h] = c.sets as [Set<number>, Set<number>];
  const minute = only(mi);
  const days = describeDays(c);
  if (minute === undefined || !days) return fallback;
  const hour = only(h);
  if (hour !== undefined) return `${days} at ${pad(hour)}:${pad(minute)} UTC`;
  const hours = [...h];
  const step = hours[1]! - hours[0]!;
  const evenSteps = hours[0] === 0 && hours.every((v, i) => v === i * step) && 24 % step === 0 && hours.length === 24 / step;
  if (!evenSteps) return fallback;
  const every = step === 1 ? "every hour" : `every ${step} hours`;
  return `${days}, ${every} at :${pad(minute)} UTC`;
}

/** Guards scheduled runs against tight loops that would burn budget. */
export function minIntervalMinutes(expr: string, from = new Date(Date.UTC(2026, 0, 5))): number {
  const a = nextRun(expr, from);
  const b = nextRun(expr, a);
  const c = nextRun(expr, b);
  return Math.min(b.getTime() - a.getTime(), c.getTime() - b.getTime()) / 60_000;
}
