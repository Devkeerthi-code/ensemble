import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";

/**
 * Integration test against the real database (DATABASE_URL). Creates two throwaway users,
 * checks neither can read or change the other's data, then deletes them. Makes no model calls.
 */
const hasDb = Boolean(process.env.DATABASE_URL && process.env.ENCRYPTION_KEY);

describe.skipIf(!hasDb)("user isolation (database)", async () => {
  const { db } = await import("@/lib/server/db");
  const runs = await import("@/lib/server/orchestrator/runs");
  const { runSnapshot } = await import("@/lib/server/orchestrator/snapshot");
  const keys = await import("@/lib/server/orchestrator/keys");

  const tag = randomBytes(4).toString("hex");
  let alice = "";
  let bob = "";
  let aliceRun = "";
  let aliceApproval = "";

  beforeAll(async () => {
    alice = (await db.user.create({ data: { email: `iso-a-${tag}@example.test`, passwordHash: "x" } })).id;
    bob = (await db.user.create({ data: { email: `iso-b-${tag}@example.test`, passwordHash: "x" } })).id;
    const goal = await db.goal.create({ data: { userId: alice, title: "Alice's private goal", criteria: "secret", budgetUsd: 1 } });
    const run = await db.run.create({ data: { userId: alice, goalId: goal.id, budgetUsd: 1, status: "running" } });
    aliceRun = run.id;
    const task = await db.task.create({ data: { runId: run.id, key: "a", title: "Secret task", skill: "writing", instructions: "Write the secret plan.", acceptance: "ok", dependsOn: [], output: "ALICE-SECRET" } });
    aliceApproval = (await db.approval.create({ data: { runId: run.id, taskId: task.id, userId: alice, kind: "spend", summary: "pricey" } })).id;
    await db.setupProfile.create({ data: { userId: alice, name: "alice-setup", answers: {}, templateVersion: "test" } });
    await keys.saveProviderKey(alice, "anthropic", "sk-ant-alice-only-key-123456");
  }, 60_000);

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: [alice, bob] } } });
  });

  it("Bob can't read Alice's run, tasks or outputs", async () => {
    expect(await runs.ownedRun(bob, aliceRun)).toBeNull();
    expect(await runSnapshot(bob, aliceRun)).toBeNull();
    expect((await runSnapshot(alice, aliceRun))?.tasks[0]?.output).toBe("ALICE-SECRET");
  });

  it("Bob can't pause, cancel, clone or edit Alice's run", async () => {
    expect((await runs.setRunState(bob, aliceRun, "cancel")).ok).toBe(false);
    expect((await runs.setRunState(bob, aliceRun, "pause")).ok).toBe(false);
    expect(await runs.cloneRun(bob, aliceRun)).toBeNull();
    const edit = await runs.replacePlan(bob, aliceRun, { tasks: [{ key: "x", title: "Hijack", skill: "writing", instructions: "Do something else now", acceptance: "ok", dependsOn: [], important: false }] });
    expect(edit.ok).toBe(false);
    expect((await db.run.findUnique({ where: { id: aliceRun } }))?.status).toBe("running");
  });

  it("Bob can't approve Alice's pending step", async () => {
    expect((await runs.decideApproval(bob, aliceApproval, true)).ok).toBe(false);
    expect((await db.approval.findUnique({ where: { id: aliceApproval } }))?.status).toBe("pending");
  });

  it("Bob never gets Alice's provider key, even by copying her encrypted row", async () => {
    expect((await keys.credentialsFor(bob)).anthropic).not.toBe("sk-ant-alice-only-key-123456");
    const row = await db.providerKey.findFirstOrThrow({ where: { userId: alice, provider: "anthropic" } });
    await db.providerKey.create({ data: { userId: bob, provider: "anthropic", ciphertext: row.ciphertext, iv: row.iv, tag: row.tag, last4: row.last4 } });
    expect((await keys.credentialsFor(bob)).anthropic).not.toBe("sk-ant-alice-only-key-123456");
    expect((await keys.credentialsFor(alice)).anthropic).toBe("sk-ant-alice-only-key-123456");
    const listed = await keys.listProviderKeys(alice);
    expect(JSON.stringify(listed)).not.toContain("alice-only");
  });

  it("Bob's lists don't include Alice's setups or runs", async () => {
    expect(await db.setupProfile.count({ where: { userId: bob } })).toBe(0);
    expect(await db.run.count({ where: { userId: bob } })).toBe(0);
  });
});
