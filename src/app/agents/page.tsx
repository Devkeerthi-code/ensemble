import type { Metadata } from "next";
import { AgentLibrary } from "./library";

export const metadata: Metadata = { title: "Subagent library" };

export default function AgentsPage() {
  return (
    <div className="wrap app-main">
      <div className="sh">
        <div>
          <div className="eyebrow"><span className="mark">C</span>Subagents</div>
          <h1 style={{ fontSize: "var(--t-xl)" }}>Ready-made helper agents</h1>
          <p>Subagents are specialists Claude Code can hand work to, each with its own instructions and tools. Open one to read it line by line, edit it, and copy or download the file.</p>
        </div>
      </div>
      <AgentLibrary />
    </div>
  );
}
