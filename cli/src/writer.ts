import path from "node:path";

export type PlannedFile = { path: string; content: string };
export type Decision = "overwrite" | "skip";
export type AskOverwrite = (relPath: string, existing: string, incoming: string) => Promise<Decision>;

export type FileSystem = {
  read(absPath: string): Promise<string | null>;
  write(absPath: string, content: string): Promise<void>;
};

export type WriteReport = { created: string[]; overwritten: string[]; skipped: string[]; unchanged: string[] };

/** Rejects absolute paths and anything that escapes the target folder (e.g. "../.ssh/config"). */
export function resolveInside(root: string, rel: string): string {
  if (path.isAbsolute(rel) || /^[a-zA-Z]:/.test(rel)) throw new Error(`Refusing absolute path: ${rel}`);
  const abs = path.resolve(root, rel);
  const relative = path.relative(root, abs);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`Refusing path outside the project: ${rel}`);
  return abs;
}

/**
 * Writes files into `root`. New files are created; identical files are left alone;
 * an existing file with different content is only replaced if `ask` returns "overwrite".
 */
export async function writeFiles(root: string, files: PlannedFile[], fs: FileSystem, ask: AskOverwrite, opts: { dryRun?: boolean } = {}): Promise<WriteReport> {
  const report: WriteReport = { created: [], overwritten: [], skipped: [], unchanged: [] };
  for (const file of files) {
    const abs = resolveInside(root, file.path);
    const existing = await fs.read(abs);
    if (existing === null) {
      if (!opts.dryRun) await fs.write(abs, file.content);
      report.created.push(file.path);
    } else if (existing.replace(/\r\n/g, "\n") === file.content) {
      report.unchanged.push(file.path);
    } else if ((await ask(file.path, existing, file.content)) === "overwrite") {
      if (!opts.dryRun) await fs.write(abs, file.content);
      report.overwritten.push(file.path);
    } else {
      report.skipped.push(file.path);
    }
  }
  return report;
}

/** Tiny line diff for the "show me the difference" option. */
export function summariseDiff(existing: string, incoming: string, max = 12): string {
  const a = new Set(existing.replace(/\r\n/g, "\n").split("\n"));
  const b = new Set(incoming.split("\n"));
  const removed = [...a].filter((l) => !b.has(l)).map((l) => `- ${l}`);
  const added = [...b].filter((l) => !a.has(l)).map((l) => `+ ${l}`);
  const lines = [...removed, ...added];
  return lines.slice(0, max).join("\n") + (lines.length > max ? `\n… ${lines.length - max} more changed lines` : "");
}
