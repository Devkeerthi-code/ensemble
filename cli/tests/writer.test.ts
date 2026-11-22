import { describe, expect, it, vi } from "vitest";
import path from "node:path";
import { resolveInside, writeFiles, type FileSystem } from "../src/writer";

const ROOT = path.resolve("/project");

function memoryFs(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial).map(([k, v]) => [path.resolve(ROOT, k), v]));
  const fs: FileSystem = {
    read: async (p) => files.get(p) ?? null,
    write: async (p, c) => void files.set(p, c),
  };
  return { fs, files };
}

describe("CLI writer never overwrites silently", () => {
  it("creates new files without asking", async () => {
    const { fs, files } = memoryFs();
    const ask = vi.fn();
    const r = await writeFiles(ROOT, [{ path: "CLAUDE.md", content: "x\n" }], fs, ask);
    expect(r.created).toEqual(["CLAUDE.md"]);
    expect(ask).not.toHaveBeenCalled();
    expect(files.get(path.resolve(ROOT, "CLAUDE.md"))).toBe("x\n");
  });

  it("asks before replacing a different existing file, and keeps it when the answer is skip", async () => {
    const { fs, files } = memoryFs({ "CLAUDE.md": "my own rules\n" });
    const ask = vi.fn().mockResolvedValue("skip");
    const r = await writeFiles(ROOT, [{ path: "CLAUDE.md", content: "generated\n" }], fs, ask);
    expect(ask).toHaveBeenCalledOnce();
    expect(r.skipped).toEqual(["CLAUDE.md"]);
    expect(files.get(path.resolve(ROOT, "CLAUDE.md"))).toBe("my own rules\n");
  });

  it("overwrites only when the user says so", async () => {
    const { fs, files } = memoryFs({ "CLAUDE.md": "old\n" });
    const r = await writeFiles(ROOT, [{ path: "CLAUDE.md", content: "new\n" }], fs, async () => "overwrite");
    expect(r.overwritten).toEqual(["CLAUDE.md"]);
    expect(files.get(path.resolve(ROOT, "CLAUDE.md"))).toBe("new\n");
  });

  it("does not ask when the file is already identical (CRLF-insensitive)", async () => {
    const { fs } = memoryFs({ "AGENTS.md": "a\r\nb\r\n" });
    const ask = vi.fn();
    const r = await writeFiles(ROOT, [{ path: "AGENTS.md", content: "a\nb\n" }], fs, ask);
    expect(r.unchanged).toEqual(["AGENTS.md"]);
    expect(ask).not.toHaveBeenCalled();
  });

  it("dry run writes nothing", async () => {
    const { fs, files } = memoryFs({ "CLAUDE.md": "old\n" });
    await writeFiles(ROOT, [{ path: "CLAUDE.md", content: "new\n" }, { path: "AGENTS.md", content: "n\n" }], fs, async () => "overwrite", { dryRun: true });
    expect(files.get(path.resolve(ROOT, "CLAUDE.md"))).toBe("old\n");
    expect(files.has(path.resolve(ROOT, "AGENTS.md"))).toBe(false);
  });

  it("refuses paths that escape the project folder", () => {
    expect(() => resolveInside(ROOT, "../.ssh/config")).toThrow(/outside/);
    expect(() => resolveInside(ROOT, "/etc/passwd")).toThrow(/absolute/);
    expect(() => resolveInside(ROOT, "C:/Windows/x")).toThrow(/absolute/);
    expect(resolveInside(ROOT, ".claude/agents/a.md")).toBe(path.resolve(ROOT, ".claude/agents/a.md"));
  });
});
