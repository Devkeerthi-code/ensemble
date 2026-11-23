import { FORBIDDEN_ALLOW_RULES, RISKY_PERMISSIONS } from "../setup/permissions";
import { AGENT_LIBRARY } from "../setup/agents";
import { formatOf, parseFrontmatter, validateFormat } from "../setup/formats";
import { recommendFromText } from "../setup/recommend";

export type InputFile = { path: string; content: string };
export type Severity = "error" | "warning" | "info";

export type Finding = {
  id: string;
  severity: Severity;
  path: string;
  title: string;
  detail: string;
  fix?: { description: string; newPath?: string; newContent?: string };
};

export type DoctorReport = { findings: Finding[]; checkedFiles: number; summary: Record<Severity, number> };

const normalise = (p: string) => p.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");

/** Common misplacements: [pattern, correct path builder, explanation]. */
const WRONG_FOLDERS: Array<[RegExp, (m: RegExpMatchArray) => string, string]> = [
  [/^(?:claude|\.claude\/agent|agents)\/([^/]+\.md)$/, (m) => `.claude/agents/${m[1]}`, "Claude Code only loads project subagents from .claude/agents/."],
  [/^\.claude\/mcp\.json$/, () => ".mcp.json", "Project MCP servers belong in .mcp.json at the project root, not inside .claude/."],
  [/^settings\.json$/, () => ".claude/settings.json", "Claude Code reads project settings from .claude/settings.json."],
  [/^\.claude\/CLAUDE\.local\.md$/, () => "CLAUDE.local.md", "CLAUDE.local.md is read from the project root."],
  [/^copilot-instructions\.md$/, () => ".github/copilot-instructions.md", "Copilot reads repository instructions from .github/copilot-instructions.md."],
  [/^\.github\/instructions\/([^/]+?)(?<!\.instructions)\.md$/, (m) => `.github/instructions/${m[1]}.instructions.md`, "Path-specific Copilot files must end in .instructions.md."],
  [/^\.cursor\/rules\/([^/]+)\.md$/, (m) => `.cursor/rules/${m[1]}.mdc`, "Cursor project rules use the .mdc extension."],
  [/^\.claude\/skills\/([^/]+)\/(?:skill|Skill|skills|SKILLS)\.md$/, (m) => `.claude/skills/${m[1]}/SKILL.md`, "The skill file must be named SKILL.md in capitals."],
  [/^gemini\.md$/, () => "GEMINI.md", "Gemini CLI looks for GEMINI.md in capitals."],
  [/^(?:claude\.md|Claude\.md)$/, () => "CLAUDE.md", "Claude Code looks for CLAUDE.md in capitals."],
];

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/sk-ant-[A-Za-z0-9_-]{20,}/, "Anthropic API key"],
  [/sk-(?:proj-)?[A-Za-z0-9_-]{20,}/, "OpenAI-style API key"],
  [/gh[pousr]_[A-Za-z0-9]{30,}/, "GitHub token"],
  [/AIza[0-9A-Za-z_-]{30,}/, "Google API key"],
  [/gsk_[A-Za-z0-9]{30,}/, "Groq API key"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
];

let counter = 0;
const finding = (f: Omit<Finding, "id">): Finding => ({ ...f, id: `f${++counter}` });

function checkLocation(file: InputFile): Finding[] {
  for (const [pattern, correct, why] of WRONG_FOLDERS) {
    const m = file.path.match(pattern);
    if (m) {
      const newPath = correct(m);
      return [finding({ severity: "error", path: file.path, title: "File is in the wrong place", detail: `${why} As it is, the tool ignores this file.`, fix: { description: `Move it to ${newPath}`, newPath } })];
    }
  }
  if (/^\.claude\/commands\//.test(file.path)) {
    return [finding({ severity: "info", path: file.path, title: "Legacy command location", detail: "Custom commands still work, but Claude Code now recommends skills in .claude/skills/<name>/SKILL.md, which support extra files and options." })];
  }
  return [];
}

function checkFormat(file: InputFile): Finding[] {
  return validateFormat(file.path, file.content).map((e) =>
    finding({ severity: "error", path: file.path, title: "Invalid format", detail: e.message }),
  );
}

function rulesOf(content: string): { allow: string[]; deny: string[]; mode?: string } | null {
  try {
    const data = JSON.parse(content) as { permissions?: { allow?: unknown; deny?: unknown; defaultMode?: unknown } };
    const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
    const mode = data.permissions?.defaultMode;
    return { allow: arr(data.permissions?.allow), deny: arr(data.permissions?.deny), mode: typeof mode === "string" ? mode : undefined };
  } catch {
    return null;
  }
}

function withPermissions(content: string, edit: (p: Record<string, unknown>) => void): string {
  const data = JSON.parse(content) as { permissions?: Record<string, unknown> };
  data.permissions ??= {};
  edit(data.permissions);
  return JSON.stringify(data, null, 2) + "\n";
}

function checkPermissions(file: InputFile): Finding[] {
  if (formatOf(file.path) !== "settings") return [];
  const rules = rulesOf(file.content);
  if (!rules) return [];
  const out: Finding[] = [];

  if (rules.mode === "bypassPermissions") {
    out.push(finding({
      severity: "error", path: file.path, title: "All permission checks are switched off",
      detail: "bypassPermissions lets the AI run any command and edit any file without asking. One bad step can delete work or leak secrets.",
      fix: { description: "Switch to the default mode, which asks before risky actions", newContent: withPermissions(file.content, (p) => { p.defaultMode = "default"; }) },
    }));
  }
  const tooBroad = rules.allow.filter((r) => FORBIDDEN_ALLOW_RULES.includes(r));
  if (tooBroad.length) {
    out.push(finding({
      severity: "error", path: file.path, title: "Allows every command without asking",
      detail: `${tooBroad.join(", ")} in allow means any shell command runs unchecked, including deleting files or uploading data.`,
      fix: { description: "Remove the catch-all rule and allow specific commands instead", newContent: withPermissions(file.content, (p) => { p.allow = rules.allow.filter((r) => !tooBroad.includes(r)); }) },
    }));
  }
  for (const risky of Object.values(RISKY_PERMISSIONS)) {
    if (rules.allow.includes(risky.rule)) {
      out.push(finding({ severity: "warning", path: file.path, title: `Risky permission: ${risky.rule}`, detail: `${risky.warning} Consider moving it to "ask".`,
        fix: { description: `Move ${risky.rule} to ask`, newContent: withPermissions(file.content, (p) => {
          p.allow = rules.allow.filter((r) => r !== risky.rule);
          const ask = Array.isArray(p.ask) ? (p.ask as string[]) : [];
          p.ask = [...ask, risky.rule];
        }) } }));
    }
  }
  if (!rules.deny.some((r) => r.startsWith("Read(./.env"))) {
    out.push(finding({
      severity: "warning", path: file.path, title: "Secrets are readable",
      detail: "Nothing stops the AI from reading .env, where API keys usually live. It could paste them into code or logs.",
      fix: { description: "Add deny rules for .env files", newContent: withPermissions(file.content, (p) => { p.deny = [...rules.deny, "Read(./.env)", "Read(./.env.*)"]; }) },
    }));
  }
  return out;
}

function checkSubagentTools(file: InputFile): Finding[] {
  if (formatOf(file.path) !== "subagent") return [];
  const fm = parseFrontmatter(file.content);
  if ("error" in fm) return [];
  const out: Finding[] = [];
  if (fm.data.tools === undefined) {
    out.push(finding({ severity: "warning", path: file.path, title: "Agent can use every tool", detail: "Without a tools line the subagent inherits all tools, including Bash and Write. List only what it needs, e.g. tools: Read, Grep, Glob." }));
  }
  if (fm.data.permissionMode === "bypassPermissions") {
    out.push(finding({ severity: "error", path: file.path, title: "Agent skips all permission checks", detail: "permissionMode: bypassPermissions lets this agent run anything without asking. Remove the line or use default." }));
  }
  const expected = file.path.split("/").pop()?.replace(/\.md$/, "");
  if (typeof fm.data.name === "string" && expected && fm.data.name !== expected) {
    out.push(finding({ severity: "info", path: file.path, title: "Name differs from file name", detail: `The agent is called "${fm.data.name}" but the file is ${expected}.md. It works, but matching names are easier to find.` }));
  }
  if (fm.body.length < 20) {
    out.push(finding({ severity: "warning", path: file.path, title: "Agent has almost no instructions", detail: "The text after the frontmatter is the agent's whole prompt. Say what it should do, step by step." }));
  }
  return out;
}

function checkSecrets(file: InputFile): Finding[] {
  for (const [pattern, label] of SECRET_PATTERNS) {
    const m = file.content.match(pattern);
    if (m) {
      const envName = label.split(" ")[0]!.toUpperCase().replace(/[^A-Z]/g, "") + "_API_KEY";
      return [finding({
        severity: "error", path: file.path, title: `Contains a ${label}`,
        detail: "Config files get committed and shared. Revoke this key now, then reference it from an environment variable.",
        fix: { description: `Replace it with \${${envName}}`, newContent: file.content.replace(m[0], `\${${envName}}`) },
      })];
    }
  }
  return [];
}

function checkSize(file: InputFile): Finding[] {
  if (!/(^|\/)(CLAUDE|AGENTS|GEMINI)\.md$|copilot-instructions\.md$/.test(file.path)) return [];
  const lines = file.content.split("\n").length;
  if (lines <= 300) return [];
  return [finding({ severity: "warning", path: file.path, title: "Instruction file is very long", detail: `${lines} lines are loaded into every request and use up context. Keep it short and specific, and move detail into separate files or skills.` })];
}

function checkSet(files: InputFile[]): Finding[] {
  const paths = new Set(files.map((f) => f.path));
  const out: Finding[] = [];
  if (paths.has("CLAUDE.local.md") && paths.has(".gitignore")) {
    const gi = files.find((f) => f.path === ".gitignore")!.content;
    if (!/CLAUDE\.local\.md/.test(gi)) {
      out.push(finding({ severity: "warning", path: ".gitignore", title: "Personal notes will be committed", detail: "CLAUDE.local.md is meant to be private, but .gitignore doesn't list it.", fix: { description: "Add CLAUDE.local.md to .gitignore", newContent: gi.trimEnd() + "\nCLAUDE.local.md\n" } }));
    }
  }
  if (paths.has("CLAUDE.md") && paths.has("AGENTS.md")) {
    const claude = files.find((f) => f.path === "CLAUDE.md")!.content;
    if (!/@AGENTS\.md/.test(claude)) {
      out.push(finding({ severity: "info", path: "CLAUDE.md", title: "Rules are kept in two places", detail: "You have both CLAUDE.md and AGENTS.md. Adding a line @AGENTS.md to CLAUDE.md imports it, so you maintain your rules once." }));
    }
  }
  out.push(...suggestAgents(files));
  return out;
}

/** No subagents yet: suggest the ones that fit what the instruction files describe. */
function suggestAgents(files: InputFile[]): Finding[] {
  const instructions = files.find((f) => f.path === "CLAUDE.md") ?? files.find((f) => f.path === "AGENTS.md");
  if (!instructions || files.some((f) => formatOf(f.path) === "subagent")) return [];
  const picks = recommendFromText(instructions.content).filter((r) => r.level === "recommended").slice(0, 4);
  if (picks.length === 0) return [];
  const list = picks.map((r) => `${AGENT_LIBRARY[r.id].title} (${r.reasons[0]})`).join("; ");
  return [finding({ severity: "info", path: instructions.path, title: "No helper agents yet", detail: `Based on your instructions, these subagents would help: ${list} Get them from the Subagents tab and save them in .claude/agents/.` })];
}

export function runDoctor(input: InputFile[]): DoctorReport {
  counter = 0;
  const files = input.map((f) => ({ path: normalise(f.path), content: f.content.replace(/\r\n/g, "\n") })).filter((f) => f.path);
  const findings = [
    ...files.flatMap((f) => [...checkLocation(f), ...checkFormat(f), ...checkPermissions(f), ...checkSubagentTools(f), ...checkSecrets(f), ...checkSize(f)]),
    ...checkSet(files),
  ];
  const order: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  const summary = { error: 0, warning: 0, info: 0 };
  for (const f of findings) summary[f.severity]++;
  return { findings, checkedFiles: files.length, summary };
}
