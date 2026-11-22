import type { AgentId, Answers } from "./answers";
import { AGENT_LIBRARY, agentLines } from "./agents";
import { checkSkill, mcpJson, planSkill, settingsJson } from "./claude";
import {
  agentsMd,
  claudeLocalMd,
  claudeMd,
  copilotInstructions,
  copilotTestInstructions,
  cursorRule,
  cursorTestRule,
  geminiMd,
  geminiSettings,
} from "./instructions";
import type { GeneratedFile } from "./lines";

export type GenerateOptions = { agentOverrides?: Partial<Record<AgentId, string>> };

/**
 * Pure function: same answers in, same files out. Runs on the server (saved setups, CLI)
 * and in the browser (live preview), so it must never touch I/O.
 */
export function generateSetup(a: Answers, opts: GenerateOptions = {}): GeneratedFile[] {
  const uses = (t: Answers["tools"][number]) => a.tools.includes(t);
  const sharesAgentsMd = a.tools.some((t) => t !== "claude-code");
  const files: GeneratedFile[] = [];

  if (sharesAgentsMd) {
    files.push({
      path: "AGENTS.md",
      tools: a.tools.filter((t) => t !== "claude-code"),
      scope: "project",
      purpose: "Single source of truth for project rules. Codex, Cursor, Copilot and Gemini CLI read it.",
      lines: agentsMd(a),
    });
  }

  if (uses("claude-code")) {
    files.push(
      { path: "CLAUDE.md", tools: ["claude-code"], scope: "project", purpose: "Instructions Claude Code loads in every session.", lines: claudeMd(a, sharesAgentsMd) },
      { path: ".claude/settings.json", tools: ["claude-code"], scope: "project", purpose: "Permissions: what Claude may do without asking.", lines: settingsJson(a) },
      { path: ".mcp.json", tools: ["claude-code"], scope: "project", purpose: "MCP servers (extra tools) shared with the project.", lines: mcpJson(a) },
      { path: ".claude/skills/check/SKILL.md", tools: ["claude-code"], scope: "project", purpose: "The /check command.", lines: checkSkill(a) },
      { path: ".claude/skills/plan-feature/SKILL.md", tools: ["claude-code"], scope: "project", purpose: "The /plan-feature command.", lines: planSkill() },
    );
    for (const id of a.agents) {
      const def = AGENT_LIBRARY[id];
      files.push({
        path: `.claude/agents/${id}.md`,
        tools: ["claude-code"],
        scope: "project",
        purpose: `Subagent: ${def.summary}`,
        lines: agentLines(def, a, opts.agentOverrides?.[id]),
      });
    }
    if (a.team === "team") {
      files.push({ path: "CLAUDE.local.md", tools: ["claude-code"], scope: "local", purpose: "Your personal notes. Add it to .gitignore.", lines: claudeLocalMd() });
    }
  }

  if (uses("gemini-cli")) {
    files.push(
      { path: "GEMINI.md", tools: ["gemini-cli"], scope: "project", purpose: "Context file for Gemini CLI.", lines: geminiMd(a, sharesAgentsMd) },
      { path: ".gemini/settings.json", tools: ["gemini-cli"], scope: "project", purpose: "Makes Gemini CLI read AGENTS.md as well.", lines: geminiSettings() },
    );
  }

  if (uses("cursor")) {
    files.push(
      { path: ".cursor/rules/project.mdc", tools: ["cursor"], scope: "project", purpose: "Always-on Cursor rule.", lines: cursorRule(a, sharesAgentsMd) },
      { path: ".cursor/rules/tests.mdc", tools: ["cursor"], scope: "project", purpose: "Cursor rule for test files only.", lines: cursorTestRule(a) },
    );
  }

  if (uses("copilot")) {
    files.push(
      { path: ".github/copilot-instructions.md", tools: ["copilot"], scope: "project", purpose: "Repo-wide Copilot instructions.", lines: copilotInstructions(a, sharesAgentsMd) },
      { path: ".github/instructions/tests.instructions.md", tools: ["copilot"], scope: "project", purpose: "Copilot instructions for test files.", lines: copilotTestInstructions(a) },
    );
  }

  return files;
}

/** Where things go: shown next to the file tree so beginners know project vs user level. */
export const PLACEMENT_GUIDE = [
  { where: "Project folder (committed)", examples: "CLAUDE.md, AGENTS.md, .claude/settings.json, .claude/agents/", note: "Shared with everyone who clones the repo. These are what Ensemble generates." },
  { where: "Project folder (not committed)", examples: "CLAUDE.local.md, .claude/settings.local.json", note: "Personal to you on this project. Add them to .gitignore." },
  { where: "Your user folder (~/.claude/)", examples: "~/.claude/CLAUDE.md, ~/.claude/agents/, ~/.claude/settings.json", note: "Applies to every project on your machine. Good for personal style, not project rules." },
  { where: "Gemini user folder (~/.gemini/)", examples: "~/.gemini/GEMINI.md", note: "Gemini CLI's global context, loaded for every project." },
];
