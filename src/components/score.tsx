import { TOOL_IDS, TOOL_LABELS, DEFAULT_ANSWERS, AGENT_IDS } from "@/lib/setup/answers";
import { generateSetup } from "@/lib/setup/generate";

const example = generateSetup({ ...DEFAULT_ANSWERS, description: "Example project", tools: [...TOOL_IDS], agents: [...AGENT_IDS].slice(0, 3) });

/** One staff per AI tool; each note is a file Ensemble writes for it (AGENTS.md is shared, drawn on every staff that reads it). */
export function Score() {
  return (
    <div className="score" role="img" aria-label="Five staves, one per AI tool, each showing the config files Ensemble writes for it.">
      {TOOL_IDS.map((tool) => {
        const files = example.filter((f) => f.tools.includes(tool)).slice(0, 6);
        return (
          <div className="staff" key={tool}>
            <span className="who">{TOOL_LABELS[tool]}</span>
            <svg viewBox="0 0 400 52" preserveAspectRatio="none" aria-hidden="true">
              {[10, 18, 26, 34, 42].map((y) => <line key={y} x1="0" x2="400" y1={y} y2={y} />)}
              {files.map((f, i) => {
                const x = 24 + i * 62;
                const y = 38 - ((i * 7) % 28);
                const shared = f.path === "AGENTS.md";
                return (
                  <g key={f.path}>
                    <ellipse className={shared ? "note hollow" : "note"} cx={x} cy={y} rx="6" ry="4.4" transform={`rotate(-20 ${x} ${y})`} />
                    <text className="note-lbl" x={x + 10} y={y + 3}>{f.path.split("/").pop()}</text>
                  </g>
                );
              })}
            </svg>
          </div>
        );
      })}
    </div>
  );
}
