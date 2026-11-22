import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { sha256 } from "@/lib/orchestrator/crypto";
import { db } from "@/lib/server/db";
import { rateLimit } from "@/lib/server/rate-limit";
import { audit } from "@/lib/server/telemetry";
import { createGoal, launchRun, goalSchema } from "@/lib/server/orchestrator/runs";
import { runSnapshot } from "@/lib/server/orchestrator/snapshot";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });

async function authenticate(req: Request): Promise<string | null> {
  const token = req.headers.get("authorization")?.match(/^Bearer (ens_[\w-]{20,})$/)?.[1];
  if (!token) return null;
  const row = await db.apiToken.findUnique({ where: { tokenHash: sha256(token) }, select: { id: true, userId: true } });
  if (!row) return null;
  await db.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
  return row.userId;
}

/** Ensemble as an MCP server for Claude Code and other clients. Every tool is scoped to the token's owner. */
function buildServer(userId: string, origin: string): McpServer {
  const server = new McpServer({ name: "ensemble", version: "0.1.0" });

  server.registerTool("create_goal", {
    description: "Plan a goal with Ensemble's agent team. Returns the plan and a link to review it. Set start=true to run the plan right away.",
    inputSchema: { title: z.string(), criteria: z.string(), budgetUsd: z.number(), priority: z.enum(["high", "normal", "low"]).optional(), preference: z.enum(["quality", "speed", "cost"]).optional(), start: z.boolean().optional() },
  }, async (args) => {
    const parsed = goalSchema.safeParse({ ...args, priority: args.priority ?? "normal", preference: args.preference ?? "quality" });
    if (!parsed.success) return { ...json({ error: parsed.error.issues.map((i) => i.message) }), isError: true };
    const { runId, planError } = await createGoal(userId, parsed.data);
    const started = !planError && args.start ? await launchRun(userId, runId) : null;
    const snap = await runSnapshot(userId, runId);
    return json({ runId, url: `${origin}/orchestrator/runs/${runId}`, planError, started: started?.ok ?? false, tasks: snap?.tasks.map((t) => ({ key: t.key, title: t.title, skill: t.skill, dependsOn: t.dependsOn })) });
  });

  server.registerTool("get_run", { description: "Status, per-task results and the final output of one of your runs.", inputSchema: { runId: z.string() } }, async ({ runId }) => {
    const snap = await runSnapshot(userId, runId);
    if (!snap) return { ...json({ error: "Run not found" }), isError: true };
    return json({ status: snap.status, spentUsd: snap.spentUsd, budgetUsd: snap.budgetUsd, finalOutput: snap.finalOutput, tasks: snap.tasks.map((t) => ({ key: t.key, status: t.status, model: t.modelLabel, score: t.score, output: t.output?.slice(0, 4000) })) });
  });

  server.registerTool("list_runs", { description: "Your 20 most recent runs.", inputSchema: {} }, async () => {
    const runs = await db.run.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, status: true, createdAt: true, goal: { select: { title: true } } } });
    return json(runs.map((r) => ({ runId: r.id, title: r.goal.title, status: r.status, createdAt: r.createdAt })));
  });

  return server;
}

async function handle(req: Request): Promise<Response> {
  const userId = await authenticate(req);
  if (!userId) return Response.json({ error: "Missing or invalid token. Create one in Ensemble → Settings." }, { status: 401 });
  const limited = await rateLimit(`mcp:${userId}`, 120, 60 * 60);
  if (!limited.ok) return Response.json({ error: "Rate limited" }, { status: 429, headers: { "retry-after": String(limited.retryAfterSeconds) } });
  await audit("mcp_request", { userId });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  const server = buildServer(userId, new URL(req.url).origin);
  await server.connect(transport);
  return transport.handleRequest(req);
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
