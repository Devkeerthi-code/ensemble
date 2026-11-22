import Link from "next/link";
import { Score } from "@/components/score";

export default function HomePage() {
  return (
    <section className="hero" aria-labelledby="h-home">
      <div className="wrap">
        <div className="hero-grid">
          <div>
            <h1 id="h-home">Set up your AI coding tools once. <em>Read every line</em> before you trust it.</h1>
            <p className="lede">
              Answer a few questions. Ensemble writes CLAUDE.md, AGENTS.md, Cursor rules and the rest, with a plain-English note
              beside every line. Nothing risky is switched on unless you switch it on.
            </p>
            <div className="cta">
              <Link className="btn primary" href="/studio">Start a setup, about 3 min</Link>
              <Link className="btn" href="/doctor">Check a setup I already have</Link>
            </div>
            <p className="small muted" style={{ marginTop: "var(--s4)" }}>Free. No account needed to generate files. Sign in to save setups and run AI teams.</p>
          </div>
          <figure className="panel" style={{ margin: 0 }} aria-labelledby="score-cap">
            <div className="panel-h"><span className="small" style={{ fontWeight: 600 }}>A full setup, as a score</span><span className="demo">example</span></div>
            <Score />
            <figcaption id="score-cap" className="xs muted" style={{ padding: "0 var(--s4) var(--s4)" }}>
              One staff per tool. Filled notes are files written for that tool; the hollow note is AGENTS.md, the rules every tool shares.
            </figcaption>
          </figure>
        </div>
        <div className="trio">
          <Link href="/studio"><b><span className="mark">B</span>Setup Studio</b><p>A short questionnaire becomes config files for Claude Code, Codex, Gemini CLI, Cursor and Copilot, each line explained.</p></Link>
          <Link href="/doctor"><b><span className="mark">D</span>Doctor</b><p>Paste or upload an existing setup. See what is wrong (wrong folder, broken frontmatter, unsafe permissions) and fix it.</p></Link>
          <Link href="/orchestrator"><b><span className="mark">E</span>Orchestrator</b><p>Give a goal and a budget. Edit the plan, then watch several models work through it in parallel, with a judge checking results.</p></Link>
        </div>
      </div>
    </section>
  );
}
