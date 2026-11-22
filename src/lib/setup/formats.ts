import { z } from "zod";
import { parse as parseYaml } from "yaml";

export type Frontmatter = { data: Record<string, unknown>; body: string } | { error: string };

export function parseFrontmatter(content: string): Frontmatter {
  const text = content.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  if (!text.startsWith("---\n")) return { error: "File must start with a --- frontmatter block." };
  const end = text.indexOf("\n---", 4);
  if (end === -1) return { error: "Frontmatter is never closed. Add a line with --- after the settings." };
  try {
    const data: unknown = parseYaml(text.slice(4, end));
    if (!data || typeof data !== "object" || Array.isArray(data)) return { error: "Frontmatter must be key: value pairs." };
    return { data: data as Record<string, unknown>, body: text.slice(end + 4).trim() };
  } catch (e) {
    return { error: `Frontmatter is not valid YAML: ${(e as Error).message.split("\n")[0]}` };
  }
}

const kebab = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens, e.g. code-reviewer");

/** Claude Code subagent frontmatter (code.claude.com/docs/en/sub-agents). */
export const subagentFrontmatter = z
  .object({
    name: kebab,
    description: z.string().min(1, "description is required: it tells Claude when to use the agent"),
    tools: z.union([z.string(), z.array(z.string())]).optional(),
    disallowedTools: z.union([z.string(), z.array(z.string())]).optional(),
    model: z.string().regex(/^(sonnet|opus|haiku|fable|inherit|claude-[a-z0-9.-]+)$/, "model must be sonnet, opus, haiku, fable, inherit or a full model id").optional(),
    permissionMode: z.enum(["default", "acceptEdits", "auto", "dontAsk", "bypassPermissions", "plan", "manual"]).optional(),
    color: z.enum(["red", "blue", "green", "yellow", "purple", "orange", "pink", "cyan"]).optional(),
  })
  .passthrough();

/** Claude Code skill frontmatter (code.claude.com/docs/en/skills). */
export const skillFrontmatter = z
  .object({
    name: kebab.optional(),
    description: z.string().min(1, "description is required so Claude and the / menu know what the skill does"),
    "disable-model-invocation": z.boolean().optional(),
    "argument-hint": z.string().optional(),
    "allowed-tools": z.union([z.string(), z.array(z.string())]).optional(),
  })
  .passthrough();

const ruleList = z.array(z.string().regex(/^[A-Za-z*][\w*]*(\(.+\))?$/, "Rule must look like Tool or Tool(specifier), e.g. Bash(npm test:*)"));

/** .claude/settings.json (code.claude.com/docs/en/settings). */
export const claudeSettings = z
  .object({
    $schema: z.string().optional(),
    permissions: z
      .object({
        allow: ruleList.optional(),
        ask: ruleList.optional(),
        deny: ruleList.optional(),
        defaultMode: z.enum(["default", "acceptEdits", "plan", "auto", "dontAsk", "bypassPermissions"]).optional(),
        additionalDirectories: z.array(z.string()).optional(),
      })
      .strict()
      .optional(),
  })
  .passthrough();

const stdioServer = z.object({ type: z.literal("stdio").optional(), command: z.string().min(1), args: z.array(z.string()).optional(), env: z.record(z.string(), z.string()).optional() });
const remoteServer = z.object({ type: z.enum(["http", "sse"]), url: z.string().url(), headers: z.record(z.string(), z.string()).optional() });

/** .mcp.json (code.claude.com/docs/en/mcp). */
export const mcpConfig = z.object({ mcpServers: z.record(z.string(), z.union([stdioServer, remoteServer])) });

/** Cursor .mdc rules (cursor.com/docs/context/rules). */
export const cursorFrontmatter = z
  .object({ description: z.string().optional(), globs: z.union([z.string(), z.array(z.string())]).optional(), alwaysApply: z.boolean().optional() })
  .passthrough();

/** Copilot path-specific instructions (docs.github.com, repository custom instructions). */
export const copilotFrontmatter = z.object({ applyTo: z.string().min(1, "applyTo is required, e.g. \"**/*.ts\"") }).passthrough();

export const geminiSettings = z.object({ context: z.object({ fileName: z.union([z.string(), z.array(z.string())]) }).partial().optional() }).passthrough();

export type FormatKind = "subagent" | "skill" | "command" | "settings" | "mcp" | "cursor" | "copilot-path" | "gemini-settings" | "markdown";

export function formatOf(path: string): FormatKind {
  if (/(^|\/)\.claude\/agents\/[^/]+\.md$/.test(path)) return "subagent";
  if (/(^|\/)\.claude\/skills\/[^/]+\/SKILL\.md$/.test(path)) return "skill";
  if (/(^|\/)\.claude\/commands\/.+\.md$/.test(path)) return "command";
  if (/(^|\/)\.claude\/settings(\.local)?\.json$/.test(path)) return "settings";
  if (/(^|\/)\.mcp\.json$/.test(path)) return "mcp";
  if (/(^|\/)\.cursor\/rules\/.+\.mdc$/.test(path)) return "cursor";
  if (/(^|\/)\.github\/instructions\/.+\.instructions\.md$/.test(path)) return "copilot-path";
  if (/(^|\/)\.gemini\/settings\.json$/.test(path)) return "gemini-settings";
  return "markdown";
}

export type FormatError = { message: string };

function zodMessages(error: z.ZodError): FormatError[] {
  return error.issues.map((i) => ({ message: `${i.path.join(".") || "file"}: ${i.message}` }));
}

function checkFrontmatter(content: string, schema: z.ZodTypeAny): FormatError[] {
  const fm = parseFrontmatter(content);
  if ("error" in fm) return [{ message: fm.error }];
  const r = schema.safeParse(fm.data);
  return r.success ? [] : zodMessages(r.error);
}

function checkJson(content: string, schema: z.ZodTypeAny): FormatError[] {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch (e) {
    return [{ message: `Not valid JSON: ${(e as Error).message}` }];
  }
  const r = schema.safeParse(data);
  return r.success ? [] : zodMessages(r.error);
}

/** Validates one file against the official format for its location. Empty array means valid. */
export function validateFormat(path: string, content: string): FormatError[] {
  switch (formatOf(path)) {
    case "subagent":
      return checkFrontmatter(content, subagentFrontmatter);
    case "skill":
      return checkFrontmatter(content, skillFrontmatter);
    case "settings":
      return checkJson(content, claudeSettings);
    case "mcp":
      return checkJson(content, mcpConfig);
    case "cursor":
      return checkFrontmatter(content, cursorFrontmatter);
    case "copilot-path":
      return checkFrontmatter(content, copilotFrontmatter);
    case "gemini-settings":
      return checkJson(content, geminiSettings);
    default:
      return content.trim().length === 0 ? [{ message: "File is empty." }] : [];
  }
}
