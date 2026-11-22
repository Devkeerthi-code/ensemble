"use client";

import { useMemo, useState } from "react";
import { AGENT_IDS, DEFAULT_ANSWERS, type AgentId } from "@/lib/setup/answers";
import { AGENT_LIBRARY, agentLines } from "@/lib/setup/agents";
import { validateFormat } from "@/lib/setup/formats";
import { useToast } from "@/components/toast";

const sample = { ...DEFAULT_ANSWERS, projectName: "your-project", description: "your project, as described in Setup Studio" };

function initialText(id: AgentId): string {
  return agentLines(AGENT_LIBRARY[id], sample).map((l) => l.text).join("\n") + "\n";
}

export function AgentLibrary() {
  const [open, setOpen] = useState<AgentId>("code-reviewer");
  const [drafts, setDrafts] = useState<Partial<Record<AgentId, string>>>({});
  const [mode, setMode] = useState<"explain" | "edit">("explain");
  const { toast } = useToast();
  const def = AGENT_LIBRARY[open];
  const text = drafts[open] ?? initialText(open);
  const path = `.claude/agents/${open}.md`;
  const problems = useMemo(() => validateFormat(path, text), [path, text]);
  const lines = useMemo(() => agentLines(def, sample), [def]);

  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
    Object.assign(document.createElement("a"), { href: url, download: `${open}.md` }).click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="files">
      <div className="panel" style={{ alignSelf: "start" }}>
        <ul className="tree" aria-label="Subagents">
          {AGENT_IDS.map((id) => (
            <li key={id}>
              <button type="button" aria-pressed={id === open} onClick={() => setOpen(id)}>
                <span>{AGENT_LIBRARY[id].title}</span>{drafts[id] !== undefined && <span className="warn" aria-label="edited">•</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="panel">
        <div className="panel-h">
          <div><b>{def.title}</b><p className="xs muted">{def.summary}</p></div>
          <div className="seg" role="radiogroup" aria-label="View">
            {(["explain", "edit"] as const).map((m) => (
              <label key={m}><input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} /><span>{m === "explain" ? "Explained" : "Edit"}</span></label>
            ))}
          </div>
        </div>
        {mode === "explain" && drafts[open] === undefined ? (
          <div className="lines">
            {lines.map((l, i) => <div key={i} className="line"><pre>{l.text || " "}</pre><div className="why">{l.why ?? ""}</div></div>)}
          </div>
        ) : (
          <div className="panel-b stack">
            {mode === "explain" && <p className="small muted">You have edited this agent, so the line notes are hidden. Reset to see them again.</p>}
            <label className="sr" htmlFor="agent-edit">Agent file</label>
            <textarea id="agent-edit" rows={18} value={text} onChange={(e) => setDrafts((d) => ({ ...d, [open]: e.target.value }))} spellCheck={false} />
            {problems.length > 0 ? (
              <ul className="form-error" role="alert">{problems.map((p) => <li key={p.message}>{p.message}</li>)}</ul>
            ) : (
              <p className="small muted">Valid subagent file.</p>
            )}
          </div>
        )}
        <div className="panel-b out" style={{ borderTop: "1px solid var(--rule)" }}>
          <button className="btn primary" type="button" onClick={download} disabled={problems.length > 0}>Download {open}.md</button>
          <button className="btn" type="button" onClick={() => navigator.clipboard.writeText(text).then(() => toast("Agent copied"), () => toast("Clipboard blocked. Copy by hand.", { bad: true }))}>Copy</button>
          {drafts[open] !== undefined && <button className="btn ghost" type="button" onClick={() => setDrafts((d) => { const n = { ...d }; delete n[open]; return n; })}>Reset</button>}
          <span className="xs muted">Save it to <code>{path}</code> in your project, or <code>~/.claude/agents/</code> to use it everywhere.</span>
        </div>
      </div>
    </div>
  );
}
