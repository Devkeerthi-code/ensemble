"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { encodePreset, RISKY_IDS, type Answers, type RiskyId } from "@/lib/setup/answers";
import { generateSetup, PLACEMENT_GUIDE } from "@/lib/setup/generate";
import { fileContent, type GeneratedFile } from "@/lib/setup/lines";
import { RISKY_PERMISSIONS } from "@/lib/setup/permissions";
import { saveSetupAction } from "@/app/studio/actions";
import { useToast } from "./toast";

type Props = { answers: Answers; onChange: (a: Answers) => void; onBack: () => void; signedIn: boolean; setupId?: string };

export const CLI_PACKAGE = "ensemble-setup";

function trackClient(event: "zip_downloaded" | "cli_copied") {
  void fetch("/api/track", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event }) }).catch(() => undefined);
}

async function downloadZip(files: GeneratedFile[], name: string) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const f of files) zip.file(f.path, fileContent(f));
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: `${name.replace(/[^\w.-]+/g, "-")}-ai-setup.zip` });
  a.click();
  URL.revokeObjectURL(url);
}

export function FileViewer({ answers, onChange, onBack, signedIn, setupId }: Props) {
  const files = useMemo(() => generateSetup(answers), [answers]);
  const [selected, setSelected] = useState(files[0]?.path ?? "");
  const [saving, startSave] = useTransition();
  const { toast } = useToast();
  const file = files.find((f) => f.path === selected) ?? files[0];
  const cli = `npx ${CLI_PACKAGE} init --preset ${encodePreset(answers)}`;
  const hasClaude = answers.tools.includes("claude-code");

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} copied`);
    } catch {
      toast("Couldn't reach the clipboard. Select the text and copy it by hand.", { bad: true });
    }
  }

  function setRisky(id: RiskyId, on: boolean) {
    const riskyOptIns = on ? [...answers.riskyOptIns, id] : answers.riskyOptIns.filter((r) => r !== id);
    onChange({ ...answers, riskyOptIns: RISKY_IDS.filter((r) => riskyOptIns.includes(r)) });
  }

  function save() {
    startSave(async () => {
      const res = await saveSetupAction({ answers, id: setupId });
      if (res.ok) toast("Setup saved. Find it under Saved setups.");
      else toast(res.error, { bad: true });
    });
  }

  return (
    <div className="stack">
      <div className="panel">
        <div className="panel-h">
          <div className="out">
            <button className="btn primary" type="button" onClick={() => downloadZip(files, answers.projectName).then(() => { trackClient("zip_downloaded"); toast(`Downloaded ${files.length} files as a zip`); })}>
              Download zip ({files.length} files)
            </button>
            {file && <button className="btn" type="button" onClick={() => copy(fileContent(file), file.path)}>Copy this file</button>}
            {signedIn ? (
              <button className="btn" type="button" onClick={save} disabled={saving}>{saving ? "Saving…" : setupId ? "Save changes" : "Save setup"}</button>
            ) : (
              <Link className="btn ghost" href="/login?next=/studio">Sign in to save</Link>
            )}
          </div>
          <button className="btn ghost sm" type="button" onClick={onBack}>Change answers</button>
        </div>
        <div className="panel-b stack">
          <div className="field">
            <span className="label">Or write the files straight into your project folder</span>
            <div className="npx">
              <code style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{cli}</code>
              <button className="btn sm" type="button" onClick={() => { void copy(cli, "Command"); trackClient("cli_copied"); }}>Copy</button>
            </div>
            <span className="xs muted">Run it in your project folder. It shows each file first and never overwrites an existing file without asking you.</span>
          </div>
        </div>
      </div>

      {hasClaude && (
        <div className="panel" aria-labelledby="risky-h">
          <div className="panel-h"><h2 id="risky-h" style={{ fontSize: "var(--t-lg)" }}>Risky permissions</h2><span className="xs muted">All off by default</span></div>
          {RISKY_IDS.map((id) => {
            const r = RISKY_PERMISSIONS[id];
            const on = answers.riskyOptIns.includes(id);
            return (
              <div key={id} className="risk" style={on ? undefined : { borderColor: "var(--rule)" }}>
                <label className="toggle"><input type="checkbox" checked={on} onChange={(e) => setRisky(id, e.target.checked)} aria-describedby={`${id}-warn`} /><i /><span className="sr">{r.label}</span></label>
                <div className="risk-body">
                  <span className="small" style={{ fontWeight: 600 }}>{r.label} <code>{r.rule}</code></span>
                  <span id={`${id}-warn`} className="small">{on ? <b>Switched on. </b> : null}{r.warning}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="files">
        <div className="panel" style={{ alignSelf: "start" }}>
          <ul className="tree" aria-label="Generated files">
            {files.map((f) => (
              <li key={f.path}>
                <button type="button" aria-pressed={f.path === file?.path} onClick={() => setSelected(f.path)}>
                  <span>{f.path}</span>
                  {f.lines.some((l) => l.risk) && <span className="warn" aria-label="contains a risky permission">!</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
        {file && (
          <div className="panel">
            <div className="panel-h">
              <div><code className="small" style={{ fontWeight: 600 }}>{file.path}</code><p className="xs muted">{file.purpose}</p></div>
              <span className="demo">{file.scope === "local" ? "personal, git-ignored" : "project, committed"}</span>
            </div>
            <div className="lines" role="table" aria-label={`${file.path} with explanations`}>
              {file.lines.map((l, i) => (
                <div role="row" key={i} className={`line${l.risk ? " risky" : ""}`}>
                  <pre role="cell">{l.text || " "}</pre>
                  <div role="cell" className="why">{l.why ?? ""}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="panel panel-b">
        <h2 style={{ fontSize: "var(--t-lg)", marginBottom: "var(--s3)" }}>Where do these files go?</h2>
        <ul className="place">
          {PLACEMENT_GUIDE.map((p) => <li key={p.where}><b>{p.where}</b><code className="xs">{p.examples}</code><p className="small muted">{p.note}</p></li>)}
        </ul>
      </div>
    </div>
  );
}
