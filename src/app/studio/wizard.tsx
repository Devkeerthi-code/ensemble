"use client";

import { useMemo, useState } from "react";
import {
  AGENT_IDS,
  CAUTION_LEVELS,
  LANGUAGES,
  MCP_IDS,
  PACKAGE_MANAGERS,
  PROJECT_TYPES,
  TOOL_IDS,
  TOOL_LABELS,
  answersSchema,
  type Answers,
  type Caution,
} from "@/lib/setup/answers";
import { AGENT_LIBRARY } from "@/lib/setup/agents";
import { generateSetup } from "@/lib/setup/generate";
import { FileViewer } from "@/components/file-viewer";

const STEPS = ["Project", "Stack", "Tools", "Safety", "Helpers", "Files"] as const;
const CAUTIONS = Object.keys(CAUTION_LEVELS) as Caution[];
const MCP_LABELS: Record<(typeof MCP_IDS)[number], string> = {
  context7: "Context7 (up-to-date library docs)",
  github: "GitHub (issues and PRs)",
  playwright: "Playwright (check pages in a browser)",
};

type Props = { initial: Answers; signedIn: boolean; setupId?: string };

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** Which fields each step owns, so "Next" only validates what's on screen. */
const STEP_FIELDS: Array<Array<keyof Answers>> = [
  ["projectName", "description", "projectType"],
  ["languages", "frameworks", "packageManager"],
  ["tools"],
  ["caution", "team"],
  ["agents", "mcpServers"],
];

export function StudioWizard({ initial, signedIn, setupId }: Props) {
  const [answers, setAnswers] = useState<Answers>(initial);
  const [step, setStep] = useState(setupId ? STEPS.length - 1 : 0);
  const [errors, setErrors] = useState<Partial<Record<keyof Answers, string>>>({});
  const [frameworkText, setFrameworkText] = useState(initial.frameworks.join(", "));
  const set = <K extends keyof Answers>(key: K, value: Answers[K]) => setAnswers((a) => ({ ...a, [key]: value }));

  const preview = useMemo(() => {
    const parsed = answersSchema.safeParse({ ...answers, description: answers.description || "(your project description)" });
    return parsed.success ? generateSetup(parsed.data) : [];
  }, [answers]);

  function next() {
    const result = answersSchema.safeParse(answers);
    const fields = STEP_FIELDS[step] ?? [];
    const stepErrors: Partial<Record<keyof Answers, string>> = {};
    if (!result.success) {
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof Answers;
        if (fields.includes(key) && !stepErrors[key]) stepErrors[key] = issue.message;
      }
    }
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length === 0) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  const err = (k: keyof Answers) => errors[k] && <span className="err" role="alert">{errors[k]}</span>;

  if (step === STEPS.length - 1) {
    return <FileViewer answers={answersSchema.parse(answers)} onChange={setAnswers} onBack={() => setStep(STEPS.length - 2)} signedIn={signedIn} setupId={setupId} />;
  }

  return (
    <div className="q-grid">
      <form className="panel panel-b q" onSubmit={(e) => { e.preventDefault(); next(); }} noValidate>
        <div className="steps" aria-label={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}>
          {STEPS.map((s, i) => <i key={s} className={i < step ? "on" : i === step ? "now" : ""} />)}
        </div>

        {step === 0 && (
          <>
            <div className="field">
              <label htmlFor="projectName">Project name</label>
              <input id="projectName" className="input" value={answers.projectName} onChange={(e) => set("projectName", e.target.value)} aria-invalid={Boolean(errors.projectName)} maxLength={60} />
              {err("projectName")}
            </div>
            <div className="field">
              <label htmlFor="description">What are you building, and for whom?</label>
              <textarea id="description" rows={3} value={answers.description} onChange={(e) => set("description", e.target.value)} aria-invalid={Boolean(errors.description)} maxLength={400}
                placeholder="A website where students in my college can swap second-hand textbooks." style={{ fontFamily: "var(--font)", fontSize: "var(--t-sm)" }} />
              <span className="xs muted">The AI reads this in every session, so one specific sentence beats a vague paragraph.</span>
              {err("description")}
            </div>
            <fieldset>
              <legend>What kind of project is it?</legend>
              <div className="chips">
                {Object.entries(PROJECT_TYPES).map(([id, label]) => (
                  <label className="chip" key={id}><input type="radio" name="ptype" checked={answers.projectType === id} onChange={() => set("projectType", id as Answers["projectType"])} /><span>{label}</span></label>
                ))}
              </div>
            </fieldset>
          </>
        )}

        {step === 1 && (
          <>
            <fieldset>
              <legend>Languages</legend>
              <p className="hint">Pick all you use in this project.</p>
              <div className="chips">
                {LANGUAGES.map((l) => (
                  <label className="chip" key={l}><input type="checkbox" checked={answers.languages.includes(l)} onChange={() => set("languages", toggle(answers.languages, l))} /><span>{l}</span></label>
                ))}
              </div>
              {err("languages")}
            </fieldset>
            <div className="field">
              <label htmlFor="frameworks">Frameworks and libraries (optional)</label>
              <input id="frameworks" className="input" value={frameworkText} placeholder="Next.js, Tailwind, Prisma"
                onChange={(e) => { setFrameworkText(e.target.value); set("frameworks", e.target.value.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 8)); }} />
              <span className="xs muted">Separate with commas.</span>
              {err("frameworks")}
            </div>
            <div className="field">
              <label htmlFor="pm">Package manager or build tool</label>
              <select id="pm" className="input" value={answers.packageManager} onChange={(e) => set("packageManager", e.target.value as Answers["packageManager"])}>
                {PACKAGE_MANAGERS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <span className="xs muted">Used to write the exact install, test and lint commands.</span>
            </div>
          </>
        )}

        {step === 2 && (
          <fieldset>
            <legend>Which AI coding tools do you use?</legend>
            <p className="hint">Pick all that apply. Ensemble writes one shared rule set and translates it for each tool.</p>
            <div className="chips">
              {TOOL_IDS.map((t) => (
                <label className="chip" key={t}><input type="checkbox" checked={answers.tools.includes(t)} onChange={() => set("tools", toggle(answers.tools, t))} /><span>{TOOL_LABELS[t]}</span></label>
              ))}
            </div>
            {err("tools")}
          </fieldset>
        )}

        {step === 3 && (
          <>
            <fieldset className="caution">
              <legend>How cautious should the AI be?</legend>
              <input type="range" min={0} max={2} step={1} value={CAUTIONS.indexOf(answers.caution)} aria-label="Caution level"
                aria-valuetext={CAUTION_LEVELS[answers.caution]} onChange={(e) => set("caution", CAUTIONS[Number(e.target.value)] ?? "balanced")} />
              <div className="ticks" aria-hidden="true"><span>Careful</span><span>Balanced</span><span>Hands-off</span></div>
              <output>{CAUTION_LEVELS[answers.caution]}. Whatever you pick, the AI can never read your .env secrets or force-delete folders.</output>
            </fieldset>
            <fieldset>
              <legend>Solo or team?</legend>
              <div className="seg" role="radiogroup">
                {(["solo", "team"] as const).map((t) => (
                  <label key={t}><input type="radio" name="team" checked={answers.team === t} onChange={() => set("team", t)} /><span>{t === "solo" ? "Just me" : "A team"}</span></label>
                ))}
              </div>
              <p className="hint">{answers.team === "team" ? "Adds shared commit rules and a private CLAUDE.local.md for personal notes." : "Keeps the rules short and personal."}</p>
            </fieldset>
          </>
        )}

        {step === 4 && (
          <>
            <fieldset>
              <legend>Helper agents (Claude Code subagents)</legend>
              <p className="hint">Each one is a specialist Claude can hand work to. You can preview and edit them in the Subagents tab.</p>
              <div className="chips">
                {AGENT_IDS.map((id) => (
                  <label className="chip" key={id} title={AGENT_LIBRARY[id].summary}><input type="checkbox" checked={answers.agents.includes(id)} onChange={() => set("agents", toggle(answers.agents, id))} /><span>{AGENT_LIBRARY[id].title}</span></label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>MCP servers (optional)</legend>
              <p className="hint">Extra tools the AI can use. Leave empty if you are not sure. You can add them later.</p>
              <div className="chips">
                {MCP_IDS.map((id) => (
                  <label className="chip" key={id}><input type="checkbox" checked={answers.mcpServers.includes(id)} onChange={() => set("mcpServers", toggle(answers.mcpServers, id))} /><span>{MCP_LABELS[id]}</span></label>
                ))}
              </div>
            </fieldset>
          </>
        )}

        <div className="q-foot">
          <button type="button" className="btn ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Back</button>
          <button type="submit" className="btn primary">{step === STEPS.length - 2 ? "Show my files" : "Next"}</button>
        </div>
      </form>

      <aside className="panel panel-b preview" aria-label="Files so far">
        <span className="label">Files so far</span>
        <p className="xs muted">Updates as you answer.</p>
        <ul>
          {preview.map((f) => <li key={f.path}><span>{f.path}</span><span className="muted">{f.lines.length} lines</span></li>)}
        </ul>
      </aside>
    </div>
  );
}
