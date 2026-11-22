import type { Provider } from "./catalog";
import type { PlanTask } from "./dag";
import type { MeasuredScore, Preference } from "./routing";
import type { Priority, TaskState } from "./scheduler";

export type RunStatus = "draft" | "queued" | "running" | "paused" | "completed" | "failed" | "cancelled";

export type RunTask = PlanTask & {
  id: string;
  status: TaskState;
  attempts: number;
  triedModels: string[];
  provider?: Provider | null;
  model?: string | null;
  routeReason?: string | null;
  output?: string | null;
  score?: number | null;
  judgeNotes?: string | null;
  error?: string | null;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs?: number | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
};

export type RunSnapshot = {
  id: string;
  userId: string;
  status: RunStatus;
  priority: Priority;
  preference: Preference;
  budgetUsd: number;
  spentUsd: number;
  createdAt: Date;
  startedAt?: Date | null;
  goal: { title: string; criteria: string };
  tasks: RunTask[];
};

export type TaskPatch = Partial<Omit<RunTask, "id" | "key">>;
export type RunPatch = Partial<{ status: RunStatus; finalOutput: string; report: unknown; error: string | null; startedAt: Date; finishedAt: Date }>;
export type MessageInput = { fromKey: string; toKey?: string; kind: "ask" | "answer" | "handoff"; body: string };

/** Everything the engine needs from persistence. Postgres in production, in-memory in tests and the benchmark. */
export interface RunStore {
  loadRun(runId: string): Promise<RunSnapshot | null>;
  updateTask(runId: string, key: string, patch: TaskPatch): Promise<void>;
  updateRun(runId: string, patch: RunPatch): Promise<void>;
  addSpend(runId: string, userId: string, usd: number): Promise<void>;
  daySpent(userId: string): Promise<number>;
  killSwitch(): Promise<boolean>;
  event(runId: string, type: string, payload: Record<string, unknown>): Promise<void>;
  message(runId: string, m: MessageInput): Promise<void>;
  workspaceGet(runId: string, key: string): Promise<string | null>;
  workspaceSet(runId: string, key: string, value: string, authorKey: string): Promise<void>;
  workspaceList(runId: string): Promise<Array<{ key: string; authorKey: string }>>;
  approvalState(runId: string, taskKey: string): Promise<"approved" | "rejected" | "pending" | null>;
  createApproval(input: { runId: string; userId: string; taskKey: string; kind: string; summary: string; details: Record<string, unknown> }): Promise<void>;
  scores(): Promise<MeasuredScore[]>;
  saveScore(score: MeasuredScore): Promise<void>;
  /** Providers this user can use, with the key to use (user key first, then server key). */
  credentials(userId: string): Promise<Partial<Record<Provider, string>>>;
}

/** In-memory store used by tests and the benchmark. */
export class MemoryStore implements RunStore {
  runs = new Map<string, RunSnapshot>();
  events: Array<{ runId: string; type: string; payload: Record<string, unknown> }> = [];
  messages: Array<MessageInput & { runId: string }> = [];
  workspace = new Map<string, { value: string; authorKey: string }>();
  approvals = new Map<string, "approved" | "rejected" | "pending">();
  approvalLog: Array<{ runId: string; taskKey: string; kind: string; summary: string }> = [];
  scoreRows: MeasuredScore[] = [];
  spend = new Map<string, number>();
  kill = false;
  creds: Partial<Record<Provider, string>> = {};

  add(run: RunSnapshot) {
    this.runs.set(run.id, structuredClone(run));
  }
  async loadRun(id: string) {
    const r = this.runs.get(id);
    return r ? structuredClone(r) : null;
  }
  async updateTask(runId: string, key: string, patch: TaskPatch) {
    const t = this.runs.get(runId)?.tasks.find((x) => x.key === key);
    if (t) Object.assign(t, patch);
  }
  async updateRun(runId: string, patch: RunPatch) {
    const r = this.runs.get(runId);
    if (r) Object.assign(r, patch);
  }
  async addSpend(runId: string, userId: string, usd: number) {
    const r = this.runs.get(runId);
    if (r) r.spentUsd += usd;
    this.spend.set(userId, (this.spend.get(userId) ?? 0) + usd);
  }
  async daySpent(userId: string) {
    return this.spend.get(userId) ?? 0;
  }
  async killSwitch() {
    return this.kill;
  }
  async event(runId: string, type: string, payload: Record<string, unknown>) {
    this.events.push({ runId, type, payload });
  }
  async message(runId: string, m: MessageInput) {
    this.messages.push({ ...m, runId });
  }
  async workspaceGet(runId: string, key: string) {
    return this.workspace.get(`${runId}/${key}`)?.value ?? null;
  }
  async workspaceSet(runId: string, key: string, value: string, authorKey: string) {
    this.workspace.set(`${runId}/${key}`, { value, authorKey });
  }
  async workspaceList(runId: string) {
    return [...this.workspace.entries()].filter(([k]) => k.startsWith(`${runId}/`)).map(([k, v]) => ({ key: k.slice(runId.length + 1), authorKey: v.authorKey }));
  }
  async approvalState(runId: string, taskKey: string) {
    return this.approvals.get(`${runId}/${taskKey}`) ?? null;
  }
  async createApproval(input: { runId: string; userId: string; taskKey: string; kind: string; summary: string }) {
    this.approvals.set(`${input.runId}/${input.taskKey}`, "pending");
    this.approvalLog.push(input);
  }
  async scores() {
    return structuredClone(this.scoreRows);
  }
  async saveScore(s: MeasuredScore) {
    this.scoreRows = [...this.scoreRows.filter((x) => !(x.provider === s.provider && x.model === s.model && x.skill === s.skill)), s];
  }
  async credentials() {
    return this.creds;
  }
}
