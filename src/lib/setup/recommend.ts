import { AGENT_IDS, type AgentId, type Answers } from "./answers";

export type Recommendation = { id: AgentId; level: "recommended" | "useful"; reasons: string[] };

type Signal = { id: AgentId; weight: number; reason: string };

const has = (text: string, words: RegExp) => words.test(text);

const KEYWORDS: Array<{ id: AgentId; words: RegExp; reason: (hit: string) => string; weight: number }> = [
  { id: "security-reviewer", words: /\b(log ?in|sign ?up|auth|password|payment|pay|upi|stripe|razorpay|wallet|bank|medical|health|admin|personal data|aadhaar|upload)/i, reason: (w) => `It handles ${w.toLowerCase()}, so mistakes can leak data or money.`, weight: 3 },
  { id: "database-reviewer", words: /\b(database|postgres|mysql|sqlite|mongo|prisma|drizzle|supabase|firebase|sql|schema|records?|inventory|attendance|orders?|bookings?)/i, reason: (w) => `It stores ${w.toLowerCase()}, so schema changes and migrations need a second look.`, weight: 2 },
  { id: "api-designer", words: /\b(api|endpoint|rest|graphql|webhook|integration|backend|server)/i, reason: () => "It exposes or calls an API, where a clear contract saves rework.", weight: 2 },
  { id: "accessibility-reviewer", words: /\b(students?|college|school|public|customers?|citizens?|elderly|government|clinic|shop|everyone|users?)/i, reason: (w) => `Real people (${w.toLowerCase()}) will use it, many on phones or with assistive tech.`, weight: 2 },
  { id: "performance-reviewer", words: /\b(real.?time|fast|scale|thousands|dashboard|live|stream|search|maps?|video|images?)/i, reason: (w) => `"${w}" suggests speed matters to users.`, weight: 1 },
  { id: "data-scientist", words: /\b(ml|machine learning|model|predict|classif|recommend|analytics|dataset|csv|notebook|forecast|ai\b)/i, reason: () => "It works with data or models, where evaluation and reproducibility matter.", weight: 2 },
  { id: "ui-designer", words: /\b(website|web ?app|app|dashboard|landing|portfolio|ui|screens?|frontend|mobile)/i, reason: () => "It has screens people will look at.", weight: 1 },
];

const DB_FRAMEWORKS = /prisma|drizzle|typeorm|sequelize|mongoose|supabase|firebase|django|rails|laravel|sqlalchemy|postgres|mysql/i;
const UI_FRAMEWORKS = /next|react|vue|svelte|angular|tailwind|flutter|swiftui|compose|expo|astro/i;
const API_FRAMEWORKS = /express|fastapi|flask|django|nest|hono|spring|gin|fiber|rails|laravel|trpc/i;

function signals(a: Answers): Signal[] {
  const s: Signal[] = [];
  const text = `${a.projectName} ${a.description}`;
  const stack = a.frameworks.join(" ");

  s.push({ id: "debugger", weight: 2, reason: "Every project hits errors; it finds the root cause before changing code." });
  s.push({ id: "test-writer", weight: 2, reason: "Tests let the AI check its own work before saying it's done." });
  s.push({ id: "code-reviewer", weight: a.team === "team" ? 3 : 2, reason: a.team === "team" ? "In a team, every change should be reviewed before others build on it." : "A second pass catches bugs the writing agent missed." });

  if (a.projectType === "web-app" || a.projectType === "mobile") s.push({ id: "ui-designer", weight: 3, reason: a.projectType === "mobile" ? "It's a mobile app, so layout and touch states matter." : "It's a website or web app, so layout, states and mobile view matter." });
  if (a.projectType === "web-app" || a.projectType === "mobile") s.push({ id: "accessibility-reviewer", weight: 1, reason: "Screens should work with a keyboard, a screen reader and at 360px." });
  if (a.projectType === "api") s.push({ id: "api-designer", weight: 3, reason: "It's a backend API, so endpoint design is the core of the work." });
  if (a.projectType === "data-ml") s.push({ id: "data-scientist", weight: 3, reason: "It's a data or ML project." });
  if (a.projectType === "library" || a.projectType === "cli") s.push({ id: "docs-writer", weight: 3, reason: `Other people will install this ${a.projectType === "cli" ? "tool" : "library"}, so clear docs decide whether they can use it.` });
  if (a.team === "team") s.push({ id: "docs-writer", weight: 2, reason: "Teammates need setup steps and docs that stay current." });
  if (a.caution === "careful") s.push({ id: "security-reviewer", weight: 1, reason: "You asked for a careful setup." });
  if (a.languages.includes("Python") && a.projectType === "data-ml") s.push({ id: "data-scientist", weight: 1, reason: "Python data work benefits from a reproducible-analysis checklist." });

  if (DB_FRAMEWORKS.test(stack)) s.push({ id: "database-reviewer", weight: 3, reason: `You use ${stack.match(DB_FRAMEWORKS)![0]}, so migrations and queries deserve a review.` });
  if (UI_FRAMEWORKS.test(stack)) s.push({ id: "ui-designer", weight: 2, reason: `You build UI with ${stack.match(UI_FRAMEWORKS)![0]}.` });
  if (API_FRAMEWORKS.test(stack)) s.push({ id: "api-designer", weight: 2, reason: `You build endpoints with ${stack.match(API_FRAMEWORKS)![0]}.` });

  for (const k of KEYWORDS) {
    const hit = text.match(k.words);
    if (hit) s.push({ id: k.id, weight: k.weight, reason: k.reason(hit[0]) });
  }
  return s;
}

/**
 * Suggests subagents from the project idea. Rule-based on purpose: instant, free, works offline
 * in the browser and the CLI, and every suggestion carries the reason it was made.
 */
export function recommendAgents(a: Answers): Recommendation[] {
  const byId = new Map<AgentId, { weight: number; reasons: string[] }>();
  for (const s of signals(a)) {
    const cur = byId.get(s.id) ?? { weight: 0, reasons: [] };
    cur.weight += s.weight;
    if (!cur.reasons.includes(s.reason)) cur.reasons.push(s.reason);
    byId.set(s.id, cur);
  }
  return AGENT_IDS.filter((id) => byId.has(id))
    .map((id) => ({ id, weight: byId.get(id)!.weight, reasons: byId.get(id)!.reasons.slice(0, 3) }))
    .sort((x, y) => y.weight - x.weight || AGENT_IDS.indexOf(x.id) - AGENT_IDS.indexOf(y.id))
    .map(({ id, weight, reasons }) => ({ id, reasons, level: weight >= 3 ? "recommended" : "useful" }));
}

/** The default selection: everything marked recommended, capped so beginners aren't flooded. */
export function defaultAgents(a: Answers, max = 6): AgentId[] {
  return recommendAgents(a).filter((r) => r.level === "recommended").slice(0, max).map((r) => r.id);
}

/** For Doctor: guess the project from existing instruction text when there are no subagents yet. */
export function recommendFromText(text: string): Recommendation[] {
  const t = text.slice(0, 20_000);
  const projectType: Answers["projectType"] = has(t, /\b(api|backend|endpoint)/i) && !has(t, /\b(ui|page|screen|component)/i) ? "api" : has(t, /\b(notebook|dataset|model training|pandas|sklearn|pytorch)/i) ? "data-ml" : has(t, /\b(ui|page|screen|component|next\.?js|react)/i) ? "web-app" : "other";
  const frameworks = [...new Set((t.match(new RegExp(`${DB_FRAMEWORKS.source}|${UI_FRAMEWORKS.source}|${API_FRAMEWORKS.source}`, "gi")) ?? []).map((m) => m.toLowerCase()))].slice(0, 8);
  return recommendAgents({
    projectName: "project", description: t.slice(0, 400) || "Existing project", projectType, languages: ["TypeScript"], frameworks,
    packageManager: "npm", tools: ["claude-code"], caution: "balanced", team: "solo", agents: [], riskyOptIns: [], mcpServers: [],
  });
}
