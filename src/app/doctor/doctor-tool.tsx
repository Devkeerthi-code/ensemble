"use client";

import { useState, useTransition } from "react";
import type { DoctorReport, Finding, InputFile } from "@/lib/doctor";
import { useToast } from "@/components/toast";
import { runDoctorAction } from "./actions";

/** Only AI-tool config files are read from an uploaded folder; everything else stays on the device. */
const CONFIG_FILE =
  /(^|\/)(CLAUDE(\.local)?\.md|AGENTS\.md|GEMINI\.md|\.mcp\.json|settings(\.local)?\.json|copilot-instructions\.md|\.gitignore|[^/]+\.mdc|[^/]+\.instructions\.md)$|(^|\/)(\.claude|agents|claude|\.cursor|\.github\/instructions|\.gemini)\//i;
const IGNORED_DIR = /(^|\/)(node_modules|\.git|\.next|dist|build)\//;

const EXAMPLE: InputFile[] = [
  { path: ".claude/settings.json", content: '{\n  "permissions": {\n    "defaultMode": "bypassPermissions",\n    "allow": ["Bash"]\n  }\n}\n' },
  { path: "agents/reviewer.md", content: "---\nname: Reviewer\ndescription: Reviews code\n---\n\nReview my code." },
];

function stripRoot(path: string): string {
  const parts = path.split("/");
  return parts.length > 1 ? parts.slice(1).join("/") : path;
}

function Diff({ before, after }: { before: string; after: string }) {
  const a = before.split("\n");
  const b = after.split("\n");
  const removed = a.filter((l) => !b.includes(l)).slice(0, 8);
  const added = b.filter((l) => !a.includes(l)).slice(0, 8);
  return (
    <div className="diff" aria-label="Suggested change">
      {removed.map((l, i) => <div key={`d${i}`} className="del">- {l}</div>)}
      {added.map((l, i) => <div key={`a${i}`} className="add">+ {l}</div>)}
    </div>
  );
}

export function DoctorTool() {
  const [files, setFiles] = useState<InputFile[]>([{ path: "", content: "" }]);
  const [report, setReport] = useState<DoctorReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { toast } = useToast();

  function check(list = files) {
    const usable = list.filter((f) => f.path.trim() && f.content.trim());
    if (usable.length === 0) {
      setError("Add a file path and its contents first, or load the example.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await runDoctorAction(usable).catch(() => ({ ok: false as const, error: "Couldn't reach the server. Check your connection and try again." }));
      if (res.ok) setReport(res.report);
      else setError(res.error);
    });
  }

  async function upload(list: FileList | null) {
    if (!list || list.length === 0) return;
    const picked = Array.from(list)
      .map((file) => ({ file, path: file.webkitRelativePath ? stripRoot(file.webkitRelativePath) : file.name }))
      .filter(({ path, file }) => !IGNORED_DIR.test(path) && file.size < 100_000 && (CONFIG_FILE.test(path) || list.length === 1));
    if (picked.length === 0) {
      toast("No AI config files found in that selection.", { bad: true });
      return;
    }
    const loaded = await Promise.all(picked.slice(0, 60).map(async ({ file, path }) => ({ path, content: await file.text() })));
    setFiles(loaded);
    toast(`Loaded ${loaded.length} config file${loaded.length === 1 ? "" : "s"}`);
    check(loaded);
  }

  function applyFix(f: Finding) {
    const fix = f.fix;
    if (!fix) return;
    const next = files.map((x) => (x.path === f.path ? { path: fix.newPath ?? x.path, content: fix.newContent ?? x.content } : x));
    setFiles(next);
    toast(`Fixed: ${f.title}`);
    check(next);
  }

  const update = (i: number, patch: Partial<InputFile>) => setFiles((all) => all.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const folderProps = { webkitdirectory: "", directory: "" } as Record<string, string>;

  return (
    <div className="doc">
      <div className="panel panel-b stack" style={{ alignSelf: "start" }}>
        <label className="drop">
          <b>Upload a project folder</b>
          <span className="xs muted">Only AI config files are read. node_modules and .git are skipped.</span>
          <input type="file" multiple onChange={(e) => upload(e.target.files)} className="sr" {...folderProps} />
          <span className="btn sm">Choose folder</span>
        </label>
        <label className="btn sm ghost">
          Or pick single files
          <input type="file" multiple className="sr" onChange={(e) => upload(e.target.files)} />
        </label>
        <hr style={{ border: 0, borderTop: "1px solid var(--rule)", width: "100%" }} />
        <span className="label">Or paste files</span>
        {files.map((f, i) => (
          <div key={i} className="stack" style={{ gap: "var(--s2)" }}>
            <input className="input" aria-label={`File ${i + 1} path`} placeholder=".claude/settings.json" value={f.path} onChange={(e) => update(i, { path: e.target.value })} />
            <textarea rows={6} aria-label={`File ${i + 1} contents`} placeholder="Paste the file contents here" value={f.content} onChange={(e) => update(i, { content: e.target.value })} spellCheck={false} />
            {files.length > 1 && <button type="button" className="btn ghost sm" onClick={() => setFiles((all) => all.filter((_, j) => j !== i))}>Remove file</button>}
          </div>
        ))}
        <div className="out">
          <button type="button" className="btn sm" onClick={() => setFiles((a) => [...a, { path: "", content: "" }])}>Add another file</button>
          <button type="button" className="btn ghost sm" onClick={() => { setFiles(EXAMPLE); check(EXAMPLE); }}>Try a broken example</button>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="button" className="btn primary" onClick={() => check()} disabled={pending}>{pending ? "Checking…" : "Check files"}</button>
      </div>

      <div className="panel" aria-live="polite" aria-busy={pending}>
        <div className="panel-h">
          <b>Results</b>
          {report && (
            <div className="tally">
              <span><i className="sev err" />{report.summary.error} errors</span>
              <span><i className="sev" />{report.summary.warning} warnings</span>
              <span><i className="sev info" />{report.summary.info} tips</span>
            </div>
          )}
        </div>
        {pending && !report ? (
          [0, 1, 2].map((i) => <div className="sk-row" key={i}><span className="skel" /><span className="skel" /><span className="skel" /></div>)
        ) : !report ? (
          <div className="empty"><b>Nothing checked yet</b><p className="small muted">Upload, paste, or try the broken example to see what Doctor finds.</p></div>
        ) : report.findings.length === 0 ? (
          <div className="empty"><b>No problems found in {report.checkedFiles} file{report.checkedFiles === 1 ? "" : "s"}</b><p className="small muted">Formats are valid and permissions look safe.</p></div>
        ) : (
          <ul className="issues">
            {report.findings.map((f) => {
              const before = files.find((x) => x.path === f.path)?.content ?? "";
              return (
                <li key={f.id} className="issue">
                  <i className={`sev${f.severity === "error" ? " err" : f.severity === "info" ? " info" : ""}`} aria-label={f.severity} />
                  <div>
                    <h3>{f.title}</h3>
                    <p className="meta">{f.path}</p>
                    <p className="small">{f.detail}</p>
                    {f.fix?.newContent && <Diff before={before} after={f.fix.newContent} />}
                    {f.fix && <button type="button" className="btn sm" style={{ marginTop: "var(--s2)" }} onClick={() => applyFix(f)}>{f.fix.description}</button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
