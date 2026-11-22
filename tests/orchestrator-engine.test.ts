import { describe, expect, it } from "vitest";
import { modelId } from "@/lib/orchestrator/catalog";
import { processTask, reconcileRun, resolveApproval, startRun } from "@/lib/orchestrator/engine";
import { runInMemory } from "@/lib/orchestrator/memory-runner";
import { MemoryStore } from "@/lib/orchestrator/store";
import { fakeLlm, makeDeps, makeRun, task } from "./orchestrator-helpers";

const diamond = () => [task("a"), task("b", ["a"]), task("c", ["a"]), task("d", ["b", "c"])];

describe("engine: scheduling", () => {
  it("runs every task once, respecting dependencies, and completes the run", async () => {
    const store = new MemoryStore();
    store.add(makeRun(diamond()));
    const llm = fakeLlm({ latencyMs: 5 });
    await runInMemory(makeDeps(store, llm), "run1", { concurrency: 4 });
    const run = (await store.loadRun("run1"))!;
    expect(run.status).toBe("completed");
    const exec = llm.calls.filter((c) => !c.judge);
    expect(exec).toHaveLength(4);
    const when = (k: string) => exec.find((c) => c.prompt.includes(`TASK: Task ${k}`))!;
    expect(when("a").end).toBeLessThanOrEqual(when("b").at);
    expect(Math.max(when("b").end, when("c").end)).toBeLessThanOrEqual(when("d").at);
    expect(run.finalOutput).toContain("Result from");
    expect(store.messages.filter((m) => m.kind === "handoff").map((m) => `${m.fromKey}>${m.toKey}`).sort()).toEqual(["a>b", "a>c", "b>d", "c>d"]);
  });

  it("runs independent branches in parallel", async () => {
    const store = new MemoryStore();
    store.add(makeRun([task("a"), task("b"), task("c"), task("d")]));
    const llm = fakeLlm({ latencyMs: 40 });
    const t0 = Date.now();
    await runInMemory(makeDeps(store, llm, { perProvider: 4 }), "run1", { concurrency: 4 });
    expect(Date.now() - t0).toBeLessThan(40 * 4);
  });

  it("never exceeds the per-provider concurrency limit", async () => {
    const store = new MemoryStore();
    store.add(makeRun(Array.from({ length: 8 }, (_, i) => task(`t${i}`))));
    let inFlight = 0;
    let peak = 0;
    const llm = fakeLlm({
      behaviour: async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 15));
        inFlight--;
        return {};
      },
    });
    await runInMemory(makeDeps(store, llm, { providers: ["groq"], perProvider: 2 }), "run1", { concurrency: 8 });
    expect(peak).toBeLessThanOrEqual(2);
    expect((await store.loadRun("run1"))!.status).toBe("completed");
  });

  it("is idempotent: a duplicate job for a finished task does nothing", async () => {
    const store = new MemoryStore();
    store.add(makeRun([task("a")]));
    const llm = fakeLlm();
    const deps = makeDeps(store, llm);
    await startRun(deps, "run1");
    await processTask(deps, "run1", "a");
    await processTask(deps, "run1", "a");
    expect(llm.calls.filter((c) => !c.judge)).toHaveLength(1);
  });

  it("resumes after a crash: running tasks go back in the queue", async () => {
    const store = new MemoryStore();
    store.add(makeRun([task("a"), task("b", ["a"])]));
    const deps = makeDeps(store, fakeLlm());
    await startRun(deps, "run1");
    await store.updateTask("run1", "a", { status: "running" });
    const { enqueue } = await reconcileRun(deps, "run1");
    expect(enqueue.map((e) => e.key)).toEqual(["a"]);
    await processTask(deps, "run1", "a");
    expect((await store.loadRun("run1"))!.tasks.find((t) => t.key === "b")!.status).toBe("queued");
  });

  it("does nothing while paused or cancelled", async () => {
    const store = new MemoryStore();
    store.add(makeRun([task("a")]));
    const llm = fakeLlm();
    const deps = makeDeps(store, llm);
    await startRun(deps, "run1");
    await store.updateRun("run1", { status: "paused" });
    await processTask(deps, "run1", "a");
    expect(llm.calls).toHaveLength(0);
  });

  it("rejects a plan with a cycle", async () => {
    const store = new MemoryStore();
    store.add(makeRun([task("a", ["b"]), task("b", ["a"])]));
    await expect(startRun(makeDeps(store, fakeLlm()), "run1")).rejects.toThrow(/wait on each other/);
  });
});

describe("engine: failover, judging and budgets", () => {
  it("fails over to another provider when one errors", async () => {
    const store = new MemoryStore();
    store.add(makeRun([task("a")]));
    let firstProvider: string | undefined;
    const llm = fakeLlm({ behaviour: (call) => { firstProvider ??= call.model.provider; if (call.model.provider === firstProvider) throw Object.assign(new Error("upstream 503"), { statusCode: 503 }); return {}; } });
    await runInMemory(makeDeps(store, llm, { providers: ["openrouter", "groq"] }), "run1", { concurrency: 2 });
    const t = (await store.loadRun("run1"))!.tasks[0]!;
    expect(t.status).toBe("done");
    expect(t.provider).not.toBe(firstProvider);
    expect(t.attempts).toBe(2);
    expect(store.events.some((e) => e.type === "retry")).toBe(true);
  });

  it("retries a low judge score on a different model", async () => {
    const store = new MemoryStore();
    store.add(makeRun([task("a")]));
    let first: string | undefined;
    const llm = fakeLlm({ judgeScore: (call) => (call.prompt.includes(`Result from ${first}`) ? 3 : 9), behaviour: (call) => { first ??= call.model.model; return {}; } });
    await runInMemory(makeDeps(store, llm), "run1", { concurrency: 1 });
    const t = (await store.loadRun("run1"))!.tasks[0]!;
    expect(t.status).toBe("done");
    expect(t.model).not.toBe(first);
    expect(t.score).toBe(9);
    expect(t.triedModels.length).toBe(2);
  });

  it("gives up after the attempt limit and cancels what depends on it", async () => {
    const store = new MemoryStore();
    store.add(makeRun([task("a"), task("b", ["a"]), task("c")]));
    const llm = fakeLlm({ judgeScore: (call) => (call.prompt.includes("Task a") ? 1 : 9) });
    await runInMemory(makeDeps(store, llm), "run1", { concurrency: 2 });
    const run = (await store.loadRun("run1"))!;
    expect(run.tasks.find((t) => t.key === "a")!.status).toBe("failed");
    expect(run.tasks.find((t) => t.key === "b")!.status).toBe("cancelled");
    expect(run.tasks.find((t) => t.key === "c")!.status).toBe("done");
    expect(run.status).toBe("failed");
  });

  it("important tasks use two models and keep the better one", async () => {
    const store = new MemoryStore();
    store.add(makeRun([task("a", [], { important: true })]));
    let firstModel: string | undefined;
    const llm = fakeLlm({ behaviour: (call) => { firstModel ??= call.model.model; return {}; }, judgeScore: (call) => (firstModel && call.prompt.includes(`Result from ${firstModel}`) ? 7 : 10) });
    await runInMemory(makeDeps(store, llm), "run1", { concurrency: 1 });
    expect(llm.calls.filter((c) => !c.judge)).toHaveLength(2);
    expect(store.events.find((e) => e.type === "compare")).toBeDefined();
    expect((await store.loadRun("run1"))!.tasks[0]!.score).toBe(10);
  });

  it("stops the run before a call that would pass the budget cap", async () => {
    const store = new MemoryStore();
    store.add(makeRun([task("a"), task("b", ["a"])], { budgetUsd: 0.0001 }));
    const llm = fakeLlm();
    await runInMemory(makeDeps(store, llm), "run1", { concurrency: 1 });
    const run = (await store.loadRun("run1"))!;
    expect(llm.calls).toHaveLength(0);
    expect(run.status).toBe("failed");
    expect(run.tasks[0]!.error).toMatch(/cap/);
    expect(run.tasks[1]!.status).toBe("cancelled");
  });

  it("enforces the daily cap across runs", async () => {
    const store = new MemoryStore();
    store.add(makeRun([task("a")]));
    store.spend.set("user1", 10);
    const llm = fakeLlm();
    await runInMemory(makeDeps(store, llm), "run1", { concurrency: 1 });
    expect(llm.calls).toHaveLength(0);
    expect((await store.loadRun("run1"))!.tasks[0]!.error).toMatch(/daily cap/);
  });

  it("the kill switch pauses the run before any call", async () => {
    const store = new MemoryStore();
    store.add(makeRun([task("a")]));
    store.kill = true;
    const llm = fakeLlm();
    await runInMemory(makeDeps(store, llm), "run1", { concurrency: 1 });
    expect(llm.calls).toHaveLength(0);
    expect((await store.loadRun("run1"))!.status).toBe("paused");
  });
});

describe("engine: human approval", () => {
  it("waits for approval above the spend threshold, then runs once approved", async () => {
    const store = new MemoryStore();
    store.add(makeRun([task("a")]));
    const llm = fakeLlm();
    const deps = makeDeps(store, llm, { config: { approvalThresholdUsd: 0 } });
    await runInMemory(deps, "run1", { concurrency: 1 });
    expect(llm.calls).toHaveLength(0);
    expect((await store.loadRun("run1"))!.tasks[0]!.status).toBe("waiting_approval");
    expect(store.approvalLog[0]!.kind).toBe("spend");

    store.approvals.set("run1/a", "approved");
    const { enqueue } = await resolveApproval(deps, "run1", "a", true);
    for (const e of enqueue) await processTask(deps, "run1", e.key);
    expect((await store.loadRun("run1"))!.status).toBe("completed");
  });

  it("a rejected step fails and never calls a model", async () => {
    const store = new MemoryStore();
    store.add(makeRun([task("a")]));
    const llm = fakeLlm();
    const deps = makeDeps(store, llm, { config: { approvalThresholdUsd: 0 } });
    await runInMemory(deps, "run1", { concurrency: 1 });
    store.approvals.set("run1/a", "rejected");
    await resolveApproval(deps, "run1", "a", false);
    expect(llm.calls).toHaveLength(0);
    expect((await store.loadRun("run1"))!.tasks[0]!.status).toBe("failed");
  });
});

describe("engine: agents share work through MCP tools", () => {
  it("agents write to the workspace and ask other agents through MCP", async () => {
    const store = new MemoryStore();
    store.add(makeRun([task("a")]));
    const llm = fakeLlm({
      behaviour: async (call) => {
        if (!call.tools) return {};
        const names = call.tools.map((t) => t.name).sort();
        expect(names).toEqual(["ask_agent", "calculator", "web_fetch", "workspace_list", "workspace_read", "workspace_write"]);
        const tool = (n: string) => call.tools!.find((t) => t.name === n)!;
        await tool("workspace_write").execute({ key: "notes", value: "Prices: 120 and 80" });
        const sum = await tool("calculator").execute({ expression: "120+80" });
        const answer = await tool("ask_agent").execute({ skill: "checking", question: "Is 200 the right total?" });
        return { text: `Total ${sum}. Checker said: ${answer.slice(0, 40)}`, toolCalls: 3 };
      },
    });
    await runInMemory(makeDeps(store, llm, { config: { useTools: true } }), "run1", { concurrency: 1 });
    expect(await store.workspaceGet("run1", "notes")).toBe("Prices: 120 and 80");
    expect(store.messages.map((m) => m.kind)).toEqual(["ask", "answer"]);
    expect((await store.loadRun("run1"))!.tasks[0]!.output).toContain("Total 200");
  });

  it("never runs a model twice from a failed model id", async () => {
    const store = new MemoryStore();
    store.add(makeRun([task("a")]));
    const seen: string[] = [];
    const llm = fakeLlm({ behaviour: (call) => { seen.push(modelId(call.model)); throw Object.assign(new Error("boom"), { statusCode: 500 }); } });
    await runInMemory(makeDeps(store, llm), "run1", { concurrency: 1 });
    expect(new Set(seen).size).toBe(seen.length);
    expect((await store.loadRun("run1"))!.tasks[0]!.status).toBe("failed");
  });
});
