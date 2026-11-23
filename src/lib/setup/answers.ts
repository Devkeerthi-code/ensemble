import { z } from "zod";

export const TOOL_IDS = ["claude-code", "codex", "gemini-cli", "cursor", "copilot"] as const;
export type ToolId = (typeof TOOL_IDS)[number];

export const TOOL_LABELS: Record<ToolId, string> = {
  "claude-code": "Claude Code",
  codex: "OpenAI Codex",
  "gemini-cli": "Gemini CLI",
  cursor: "Cursor",
  copilot: "GitHub Copilot",
};

export const LANGUAGES = [
  "TypeScript",
  "JavaScript",
  "Python",
  "Java",
  "Go",
  "Rust",
  "C#",
  "PHP",
  "Kotlin",
  "Swift",
  "C++",
] as const;

export const PROJECT_TYPES = {
  "web-app": "Website or web app",
  api: "Backend API",
  mobile: "Mobile app",
  cli: "Command-line tool",
  library: "Library / package",
  "data-ml": "Data or ML project",
  other: "Something else",
} as const;

export const PACKAGE_MANAGERS = ["npm", "pnpm", "yarn", "bun", "pip", "uv", "poetry", "maven", "gradle", "go", "cargo", "dotnet"] as const;
export type PackageManager = (typeof PACKAGE_MANAGERS)[number];

export const CAUTION_LEVELS = {
  careful: "Careful: ask me before every edit and command",
  balanced: "Balanced: edit freely, ask before anything risky",
  "hands-off": "Hands-off: auto-accept edits, still ask before risky commands",
} as const;
export type Caution = keyof typeof CAUTION_LEVELS;

export const AGENT_IDS = [
  "ui-designer",
  "code-reviewer",
  "test-writer",
  "security-reviewer",
  "docs-writer",
  "debugger",
  "api-designer",
  "database-reviewer",
  "accessibility-reviewer",
  "performance-reviewer",
  "data-scientist",
] as const;
export type AgentId = (typeof AGENT_IDS)[number];

export const RISKY_IDS = ["git-push", "delete-files", "install-packages", "any-web-fetch"] as const;
export type RiskyId = (typeof RISKY_IDS)[number];

export const MCP_IDS = ["context7", "github", "playwright"] as const;
export type McpId = (typeof MCP_IDS)[number];

const shortText = (max: number) => z.string().trim().min(1).max(max);

export const answersSchema = z.object({
  projectName: shortText(60).regex(/^[\w .-]+$/, "Use letters, numbers, spaces, dots, dashes or underscores"),
  description: z.string().trim().min(10, "Describe it in at least a sentence").max(400),
  projectType: z.enum(Object.keys(PROJECT_TYPES) as [keyof typeof PROJECT_TYPES]),
  languages: z.array(z.enum(LANGUAGES)).min(1, "Pick at least one language").max(6),
  frameworks: z.array(shortText(30).regex(/^[\w .+#/-]+$/)).max(8),
  packageManager: z.enum(PACKAGE_MANAGERS),
  tools: z.array(z.enum(TOOL_IDS)).min(1, "Pick at least one AI tool"),
  caution: z.enum(Object.keys(CAUTION_LEVELS) as [Caution]),
  team: z.enum(["solo", "team"]),
  agents: z.array(z.enum(AGENT_IDS)).max(AGENT_IDS.length),
  riskyOptIns: z.array(z.enum(RISKY_IDS)).max(RISKY_IDS.length),
  mcpServers: z.array(z.enum(MCP_IDS)).max(MCP_IDS.length),
});

export type Answers = z.infer<typeof answersSchema>;

export const DEFAULT_ANSWERS: Answers = {
  projectName: "my-app",
  description: "",
  projectType: "web-app",
  languages: ["TypeScript"],
  frameworks: [],
  packageManager: "npm",
  tools: ["claude-code"],
  caution: "balanced",
  team: "solo",
  agents: ["code-reviewer", "test-writer", "debugger"],
  riskyOptIns: [],
  mcpServers: [],
};

/** Compact, URL-safe encoding so the CLI command can carry the answers. */
export function encodePreset(answers: Answers): string {
  const bytes = new TextEncoder().encode(JSON.stringify(answers));
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodePreset(code: string): Answers {
  const binary = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const json: unknown = JSON.parse(new TextDecoder().decode(bytes));
  return answersSchema.parse(json);
}
