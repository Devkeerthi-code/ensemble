import { describe, expect, it } from "vitest";
import { AGENT_IDS, DEFAULT_ANSWERS, type Answers } from "@/lib/setup/answers";
import { defaultAgents, recommendAgents, recommendFromText } from "@/lib/setup/recommend";
import { runDoctor } from "@/lib/doctor";

const a = (patch: Partial<Answers>): Answers => ({ ...DEFAULT_ANSWERS, description: "A small project for testing.", ...patch });
const ids = (x: Answers) => recommendAgents(x).filter((r) => r.level === "recommended").map((r) => r.id);

describe("subagent recommendations from the project idea", () => {
  it("a canteen ordering app with payments and a database gets security and database help", () => {
    const rec = ids(a({ description: "Students pre-order canteen food and pay with UPI; orders are stored in Postgres.", frameworks: ["Next.js", "Prisma"] }));
    expect(rec).toEqual(expect.arrayContaining(["security-reviewer", "database-reviewer", "ui-designer"]));
  });

  it("a backend API gets the API designer, not the UI designer", () => {
    const rec = ids(a({ projectType: "api", description: "REST API for a library's book catalogue.", frameworks: ["FastAPI"], languages: ["Python"] }));
    expect(rec).toContain("api-designer");
    expect(rec).not.toContain("ui-designer");
  });

  it("a data project gets the data scientist", () => {
    expect(ids(a({ projectType: "data-ml", languages: ["Python"], description: "Predict which students may drop out from attendance data." }))).toContain("data-scientist");
  });

  it("a CLI or library gets the docs writer; teams always get the reviewer", () => {
    expect(ids(a({ projectType: "cli" }))).toContain("docs-writer");
    expect(ids(a({ team: "team" }))).toContain("code-reviewer");
  });

  it("every suggestion explains itself and only uses real library agents", () => {
    for (const r of recommendAgents(a({ description: "Public website for a local clinic with online booking and login." }))) {
      expect(AGENT_IDS).toContain(r.id);
      expect(r.reasons.length).toBeGreaterThan(0);
    }
  });

  it("the default selection is capped and drawn from recommendations", () => {
    const picks = defaultAgents(a({ description: "Students log in, pay fees, upload documents; Postgres stores records; REST API; real-time dashboard.", frameworks: ["Next.js", "Prisma", "Express"] }));
    expect(picks.length).toBeLessThanOrEqual(6);
    expect(new Set(picks).size).toBe(picks.length);
  });

  it("Doctor suggests agents when a setup has instructions but no subagents", () => {
    expect(recommendFromText("Next.js app with Prisma and Postgres. Users log in.").map((r) => r.id)).toContain("database-reviewer");
    const report = runDoctor([{ path: "CLAUDE.md", content: "# Shop\nNext.js storefront with Stripe payments and Prisma." }]);
    const tip = report.findings.find((f) => f.title === "No helper agents yet");
    expect(tip?.severity).toBe("info");
    expect(tip?.detail).toMatch(/Security reviewer/);
    const withAgent = runDoctor([{ path: "CLAUDE.md", content: "# Shop" }, { path: ".claude/agents/r.md", content: "---\nname: r\ndescription: Reviews\ntools: Read\n---\nReview the diff carefully and report." }]);
    expect(withAgent.findings.some((f) => f.title === "No helper agents yet")).toBe(false);
  });
});
