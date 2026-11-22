import { describe, expect, it } from "vitest";
import { AGENT_IDS, CAUTION_LEVELS, DEFAULT_ANSWERS, TOOL_IDS, answersSchema, decodePreset, encodePreset, type Answers, type Caution } from "@/lib/setup/answers";
import { generateSetup } from "@/lib/setup/generate";
import { fileContent } from "@/lib/setup/lines";
import { validateFormat } from "@/lib/setup/formats";
import { FORBIDDEN_ALLOW_RULES } from "@/lib/setup/permissions";
import { runDoctor } from "@/lib/doctor";

const base: Answers = {
  ...DEFAULT_ANSWERS,
  projectName: "canteen-queue",
  description: "Lets students pre-order canteen food and pick it up without queueing.",
  frameworks: ["Next.js"],
};

function allToolSubsets(): Answers["tools"][] {
  const out: Answers["tools"][] = [];
  for (let mask = 1; mask < 1 << TOOL_IDS.length; mask++) out.push(TOOL_IDS.filter((_, i) => mask & (1 << i)));
  return out;
}

const settingsOf = (a: Answers) => {
  const f = generateSetup(a).find((x) => x.path === ".claude/settings.json")!;
  return JSON.parse(fileContent(f)) as { permissions: { allow: string[]; ask: string[]; deny: string[]; defaultMode: string } };
};

describe("template rendering", () => {
  const cautions = Object.keys(CAUTION_LEVELS) as Caution[];

  it.each(allToolSubsets().map((t) => [t.join(" + "), t] as const))("every file is valid for %s", (_label, tools) => {
    for (const caution of cautions) {
      for (const team of ["solo", "team"] as const) {
        const a = { ...base, tools, caution, team, agents: [...AGENT_IDS], mcpServers: ["context7", "github", "playwright"] } satisfies Answers;
        for (const file of generateSetup(a)) {
          expect(validateFormat(file.path, fileContent(file)), `${file.path} (${caution}/${team})`).toEqual([]);
        }
      }
    }
  });

  it("generated setups pass Doctor with no errors", () => {
    for (const tools of allToolSubsets()) {
      const files = generateSetup({ ...base, tools, agents: [...AGENT_IDS] }).map((f) => ({ path: f.path, content: fileContent(f) }));
      expect(runDoctor(files).summary.error, tools.join(",")).toBe(0);
    }
  });

  it("only emits files for the chosen tools", () => {
    const paths = generateSetup({ ...base, tools: ["cursor"] }).map((f) => f.path);
    expect(paths).toEqual(["AGENTS.md", ".cursor/rules/project.mdc", ".cursor/rules/tests.mdc"]);
  });

  it("shares rules through AGENTS.md when more than Claude Code is used", () => {
    const files = generateSetup({ ...base, tools: ["claude-code", "codex"] });
    expect(fileContent(files.find((f) => f.path === "CLAUDE.md")!)).toContain("@AGENTS.md");
  });

  it("puts rules directly in CLAUDE.md for Claude-only setups", () => {
    const files = generateSetup({ ...base, tools: ["claude-code"] });
    expect(files.some((f) => f.path === "AGENTS.md")).toBe(false);
    expect(fileContent(files.find((f) => f.path === "CLAUDE.md")!)).toContain("## Commands");
  });

  it("explains every non-blank structural line of settings.json", () => {
    const f = generateSetup(base).find((x) => x.path === ".claude/settings.json")!;
    const unexplained = f.lines.filter((l) => /"[^"]+"/.test(l.text) && !l.why);
    expect(unexplained).toEqual([]);
  });
});

describe("permissions are safe by default", () => {
  it.each(Object.keys(CAUTION_LEVELS) as Caution[])("%s never allows everything and always protects secrets", (caution) => {
    const p = settingsOf({ ...base, caution }).permissions;
    expect(p.allow.filter((r) => FORBIDDEN_ALLOW_RULES.includes(r))).toEqual([]);
    expect(p.deny).toContain("Read(./.env)");
    expect(p.defaultMode).not.toBe("bypassPermissions");
    expect(p.allow).not.toContain("Bash(git push:*)");
    expect(p.allow).not.toContain("Bash(rm:*)");
  });

  it("careful mode asks before running tests and denies push", () => {
    const p = settingsOf({ ...base, caution: "careful" }).permissions;
    expect(p.ask).toContain("Bash(npm test:*)");
    expect(p.deny).toContain("Bash(git push:*)");
  });

  it("risky permissions appear only when opted in, and are flagged", () => {
    const a = { ...base, caution: "careful" as const, riskyOptIns: ["git-push" as const] };
    const p = settingsOf(a).permissions;
    expect(p.allow).toContain("Bash(git push:*)");
    expect(p.deny).not.toContain("Bash(git push:*)");
    const line = generateSetup(a).find((f) => f.path === ".claude/settings.json")!.lines.find((l) => l.text.includes("git push"));
    expect(line?.risk).toBe(true);
  });
});

describe("answers", () => {
  it("round-trips through the CLI preset code", () => {
    expect(decodePreset(encodePreset(base))).toEqual(base);
  });

  it("rejects bad input", () => {
    expect(answersSchema.safeParse({ ...base, tools: [] }).success).toBe(false);
    expect(answersSchema.safeParse({ ...base, projectName: "../../etc" }).success).toBe(false);
    expect(answersSchema.safeParse({ ...base, riskyOptIns: ["everything"] }).success).toBe(false);
  });
});
