import { describe, expect, it } from "vitest";
import { runDoctor } from "@/lib/doctor";
import { validateFormat } from "@/lib/setup/formats";
import { BAD_FIXTURES } from "./doctor-fixtures";

describe("doctor catches known-bad setups", () => {
  it.each(BAD_FIXTURES)("$name", ({ files, expectTitle, severity, fixable }) => {
    const report = runDoctor(files);
    const hit = report.findings.find((f) => f.title.toLowerCase().includes(expectTitle.toLowerCase()));
    expect(hit, JSON.stringify(report.findings.map((f) => f.title))).toBeDefined();
    expect(hit!.severity).toBe(severity);
    expect(Boolean(hit!.fix)).toBe(fixable);
  });

  it("suggested content fixes resolve the problem", () => {
    for (const fx of BAD_FIXTURES) {
      for (const f of runDoctor(fx.files).findings) {
        if (!f.fix?.newContent) continue;
        const fixed = runDoctor(fx.files.map((x) => (x.path === f.path ? { ...x, content: f.fix!.newContent! } : x)));
        expect(fixed.findings.some((g) => g.title === f.title && g.path === f.path), `${fx.name}: ${f.title}`).toBe(false);
      }
    }
  });

  it("moved files land in a valid location", () => {
    for (const fx of BAD_FIXTURES) {
      for (const f of runDoctor(fx.files).findings) {
        if (!f.fix?.newPath) continue;
        const original = fx.files.find((x) => x.path === f.path)!;
        const moved = runDoctor([{ path: f.fix.newPath, content: original.content }]);
        expect(moved.findings.some((g) => g.title.includes("wrong place")), f.fix.newPath).toBe(false);
        expect(validateFormat(f.fix.newPath, original.content)).toEqual([]);
      }
    }
  });

  it("normalises Windows paths and ./ prefixes", () => {
    const r = runDoctor([{ path: ".\\agents\\x.md", content: "---\nname: x\ndescription: y\ntools: Read\n---\nDo the review carefully please." }]);
    expect(r.findings[0]?.fix?.newPath).toBe(".claude/agents/x.md");
  });

  it("finds nothing wrong in a clean setup", () => {
    const r = runDoctor([
      { path: ".claude/settings.json", content: '{"permissions":{"allow":["Bash(npm test:*)"],"deny":["Read(./.env)"]}}' },
      { path: ".claude/agents/reviewer.md", content: "---\nname: reviewer\ndescription: Reviews code\ntools: Read, Grep\n---\nReview the diff and report bugs by severity." },
    ]);
    expect(r.findings).toEqual([]);
  });
});
