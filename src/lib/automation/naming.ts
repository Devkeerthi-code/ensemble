/** Name for a duplicated workflow: "Daily digest" -> "Daily digest (copy)" -> "Daily digest (copy 2)", kept within 80 characters. */
export function copyName(name: string): string {
  const m = name.match(/^(.*) \(copy(?: (\d+))?\)$/);
  const base = m ? m[1]! : name;
  const suffix = m ? ` (copy ${Number(m[2] ?? 1) + 1})` : " (copy)";
  return base.slice(0, 80 - suffix.length).trimEnd() + suffix;
}
