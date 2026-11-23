import type { InputFile, Severity } from "@/lib/doctor";

export type BadFixture = { name: string; files: InputFile[]; expectTitle: string; severity: Severity; fixable: boolean };

const agent = (fm: string, body = "You review code. Report bugs with file and line.") => `---\n${fm}\n---\n\n${body}\n`;
/** Built at runtime so no token-shaped literal sits in the repo (GitHub push protection would flag it). */
const FAKE_GITHUB_TOKEN = ["ghp", "_", "x".repeat(36)].join("");

const okAgent = agent("name: reviewer\ndescription: Reviews code\ntools: Read");

export const BAD_FIXTURES: BadFixture[] = [
  { name: "subagent in root agents/ folder", files: [{ path: "agents/reviewer.md", content: okAgent }], expectTitle: "wrong place", severity: "error", fixable: true },
  { name: "subagent in singular .claude/agent/", files: [{ path: ".claude/agent/reviewer.md", content: okAgent }], expectTitle: "wrong place", severity: "error", fixable: true },
  { name: "mcp.json inside .claude", files: [{ path: ".claude/mcp.json", content: '{"mcpServers":{}}' }], expectTitle: "wrong place", severity: "error", fixable: true },
  { name: "copilot instructions at root", files: [{ path: "copilot-instructions.md", content: "# Rules\nUse TypeScript." }], expectTitle: "wrong place", severity: "error", fixable: true },
  { name: "cursor rule with .md extension", files: [{ path: ".cursor/rules/style.md", content: "---\nalwaysApply: true\n---\nUse tabs." }], expectTitle: "wrong place", severity: "error", fixable: true },
  { name: "lowercase skill file", files: [{ path: ".claude/skills/check/skill.md", content: "---\ndescription: Run tests\n---\nRun tests." }], expectTitle: "wrong place", severity: "error", fixable: true },
  { name: "subagent without frontmatter", files: [{ path: ".claude/agents/helper.md", content: "You are a helpful agent." }], expectTitle: "Invalid format", severity: "error", fixable: false },
  { name: "frontmatter never closed", files: [{ path: ".claude/agents/helper.md", content: "---\nname: helper\ndescription: Helps\n\nDo things." }], expectTitle: "Invalid format", severity: "error", fixable: false },
  { name: "subagent missing description", files: [{ path: ".claude/agents/helper.md", content: agent("name: helper\ntools: Read") }], expectTitle: "Invalid format", severity: "error", fixable: false },
  { name: "subagent name with capitals and spaces", files: [{ path: ".claude/agents/helper.md", content: agent("name: My Helper\ndescription: Helps\ntools: Read") }], expectTitle: "Invalid format", severity: "error", fixable: false },
  { name: "subagent with invalid model", files: [{ path: ".claude/agents/helper.md", content: agent("name: helper\ndescription: Helps\ntools: Read\nmodel: gpt-4") }], expectTitle: "Invalid format", severity: "error", fixable: false },
  { name: "subagent with broken YAML", files: [{ path: ".claude/agents/helper.md", content: agent("name: helper\ndescription: [unclosed\ntools: Read") }], expectTitle: "Invalid format", severity: "error", fixable: false },
  { name: "subagent bypassing permissions", files: [{ path: ".claude/agents/helper.md", content: agent("name: helper\ndescription: Helps\ntools: Read\npermissionMode: bypassPermissions") }], expectTitle: "skips all permission", severity: "error", fixable: false },
  { name: "subagent with no tools line", files: [{ path: ".claude/agents/helper.md", content: agent("name: helper\ndescription: Helps") }], expectTitle: "every tool", severity: "warning", fixable: false },
  { name: "settings.json not JSON", files: [{ path: ".claude/settings.json", content: "{ permissions: { allow: [] } }" }], expectTitle: "Invalid format", severity: "error", fixable: false },
  { name: "settings with unknown permissions key", files: [{ path: ".claude/settings.json", content: '{"permissions":{"allowed":["Read"]}}' }], expectTitle: "Invalid format", severity: "error", fixable: false },
  { name: "settings allow everything", files: [{ path: ".claude/settings.json", content: '{"permissions":{"allow":["Bash"],"deny":["Read(./.env)"]}}' }], expectTitle: "every command", severity: "error", fixable: true },
  { name: "settings bypassPermissions", files: [{ path: ".claude/settings.json", content: '{"permissions":{"defaultMode":"bypassPermissions","deny":["Read(./.env)"]}}' }], expectTitle: "switched off", severity: "error", fixable: true },
  { name: "settings allows git push", files: [{ path: ".claude/settings.json", content: '{"permissions":{"allow":["Bash(git push:*)"],"deny":["Read(./.env)"]}}' }], expectTitle: "Risky permission", severity: "warning", fixable: true },
  { name: "settings exposes .env", files: [{ path: ".claude/settings.json", content: '{"permissions":{"allow":["Bash(npm test:*)"]}}' }], expectTitle: "Secrets are readable", severity: "warning", fixable: true },
  { name: "mcp server without command or url", files: [{ path: ".mcp.json", content: '{"mcpServers":{"x":{"args":["a"]}}}' }], expectTitle: "Invalid format", severity: "error", fixable: false },
  {
    name: "hard-coded GitHub token in .mcp.json",
    files: [{ path: ".mcp.json", content: JSON.stringify({ mcpServers: { github: { type: "http", url: "https://api.githubcopilot.com/mcp/", headers: { Authorization: `Bearer ${FAKE_GITHUB_TOKEN}` } } } }) }],
    expectTitle: "GitHub token",
    severity: "error",
    fixable: true,
  },
  { name: "cursor alwaysApply as string", files: [{ path: ".cursor/rules/a.mdc", content: '---\nalwaysApply: "yes"\n---\nRule.' }], expectTitle: "Invalid format", severity: "error", fixable: false },
  { name: "copilot path file without applyTo", files: [{ path: ".github/instructions/ts.instructions.md", content: "---\ndescription: ts\n---\nUse strict." }], expectTitle: "Invalid format", severity: "error", fixable: false },
  { name: "CLAUDE.local.md not git-ignored", files: [{ path: "CLAUDE.local.md", content: "# me" }, { path: ".gitignore", content: "node_modules\n" }], expectTitle: "Personal notes", severity: "warning", fixable: true },
  { name: "huge CLAUDE.md", files: [{ path: "CLAUDE.md", content: "- rule\n".repeat(400) }], expectTitle: "very long", severity: "warning", fixable: false },
];
