import { describeCron } from "@/lib/automation/cron";

/** Schedules are evaluated in UTC, so times are shown in UTC to match. */
export function utc(d: Date | null): string {
  if (!d) return "never";
  return `${d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`;
}

export const scheduleText = (schedule: string | null) => (schedule ? describeCron(schedule) : "Manual / webhook only");

export const TRIGGER: Record<string, string> = { manual: "Manual", schedule: "Schedule", webhook: "Webhook" };
