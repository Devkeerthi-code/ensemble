import type { Answers, McpId } from "./answers";
import { buildPermissions } from "./permissions";
import { blank, jsonArray, line, type Line } from "./lines";
import { commandsFor } from "./stack";

export const SETTINGS_SCHEMA_URL = "https://json.schemastore.org/claude-code-settings.json";

export function settingsJson(a: Answers): Line[] {
  const p = buildPermissions(a);
  return [
    line("{", "Project settings for Claude Code. Committed to Git, so everyone on the project gets the same safety rules."),
    line(`  "$schema": "${SETTINGS_SCHEMA_URL}",`, "Lets your editor autocomplete and check this file."),
    line('  "permissions": {', "What Claude may do without asking (allow), must ask about (ask), and can never do (deny). Deny always wins."),
    line(`    "defaultMode": "${p.defaultMode}",`, p.defaultModeWhy),
    ...jsonArray("    ", "allow", p.allow, "Runs without asking. Kept to safe, read-only or project commands. Never 'allow everything'.", true),
    ...jsonArray("    ", "ask", p.ask, "Claude must ask you each time before doing these.", true),
    ...jsonArray("    ", "deny", p.deny, "Blocked completely, even if you or the AI ask.", false),
    line("  }"),
    line("}"),
  ];
}

type McpServer = { name: string; why: string; lines: string[] };

const MCP_SERVERS: Record<McpId, McpServer> = {
  context7: {
    name: "context7",
    why: "Context7 gives the AI up-to-date library docs, so it stops using outdated APIs. Remote HTTP server, no install.",
    lines: ['"type": "http",', '"url": "https://mcp.context7.com/mcp"'],
  },
  github: {
    name: "github",
    why: "GitHub's official MCP server: issues, pull requests and code search. The token is read from your environment, never written here.",
    lines: ['"type": "http",', '"url": "https://api.githubcopilot.com/mcp/",', '"headers": { "Authorization": "Bearer ${GITHUB_TOKEN}" }'],
  },
  playwright: {
    name: "playwright",
    why: "Lets the AI open your app in a real browser to check pages. Runs locally through npx.",
    lines: ['"command": "npx",', '"args": ["@playwright/mcp@latest"]'],
  },
};

export function mcpJson(a: Answers): Line[] {
  const servers = a.mcpServers;
  const body: Line[] = servers.flatMap((id, i) => {
    const s = MCP_SERVERS[id];
    return [
      line(`    "${s.name}": {`, s.why),
      ...s.lines.map((l) => line(`      ${l}`, l.includes("${") ? "${NAME} is filled in from your environment variables when Claude Code starts." : undefined)),
      line(`    }${i < servers.length - 1 ? "," : ""}`),
    ];
  });
  return [
    line("{", ".mcp.json lists MCP servers (extra tools) for this project. Claude Code asks you to approve each one the first time."),
    line(servers.length ? '  "mcpServers": {' : '  "mcpServers": {}', servers.length ? "Each key is a server name." : "No servers yet. Add one with: claude mcp add --scope project"),
    ...body,
    ...(servers.length ? [line("  }")] : []),
    line("}"),
  ];
}

export function checkSkill(a: Answers): Line[] {
  const c = commandsFor(a);
  const steps = [c.lint, c.test, c.build].filter((s): s is string => Boolean(s));
  return [
    line("---", "A skill (custom slash command). This one runs as /check."),
    line("name: check", "The command name you type after the slash."),
    line("description: Run lint, tests and build, then summarise what failed and why.", "Shown in the / menu and used by Claude to know what the skill does."),
    line("disable-model-invocation: true", "Only runs when you type /check, never on Claude's own initiative."),
    line("---"),
    blank(),
    line("Run these in order and stop at the first failure:", "The instructions Claude follows when you type /check."),
    ...steps.map((s, i) => line(`${i + 1}. \`${s}\``)),
    blank(),
    line("Then give a short summary: what passed, what failed, and the most likely cause."),
  ];
}

export function planSkill(): Line[] {
  return [
    line("---", "A second skill, run as /plan-feature followed by a description."),
    line("name: plan-feature"),
    line("description: Plan a feature before writing code. Lists files to change, risks and tests.", "Planning first catches bad approaches before any code is written."),
    line("argument-hint: <what you want to build>", "The hint shown after the command name while you type."),
    line("---"),
    blank(),
    line("Plan this feature: $ARGUMENTS", "$ARGUMENTS is replaced with whatever you type after /plan-feature."),
    blank(),
    line("1. List the files you would change and why."),
    line("2. Name the risks and anything you are unsure about."),
    line("3. List the tests you would add."),
    line("Do not edit any files. Wait for my go-ahead."),
  ];
}
