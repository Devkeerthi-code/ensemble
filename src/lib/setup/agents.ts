import type { AgentId, Answers } from "./answers";
import { commandsFor, stackSummary } from "./stack";
import { line, yamlString, type Line } from "./lines";

export type AgentDefinition = {
  id: AgentId;
  title: string;
  summary: string;
  description: string;
  tools: string[];
  toolsWhy: string;
  model: "inherit" | "sonnet" | "haiku" | "opus";
  color: "red" | "blue" | "green" | "yellow" | "purple" | "orange" | "pink" | "cyan";
  body: (answers: Answers) => string[];
};

const READ_ONLY = ["Read", "Grep", "Glob"];

export const AGENT_LIBRARY: Record<AgentId, AgentDefinition> = {
  "ui-designer": {
    id: "ui-designer",
    title: "UI designer",
    summary: "Designs and polishes screens: layout, spacing, states, accessibility.",
    description: "Use when building or changing any UI. Proposes a design, then implements it with accessible, responsive markup.",
    tools: [...READ_ONLY, "Edit", "Write"],
    toolsWhy: "Can read and edit files, but cannot run commands.",
    model: "inherit",
    color: "pink",
    body: (a) => [
      `You are a product designer and front-end engineer working on ${a.projectName} (${stackSummary(a)}).`,
      "",
      "When asked to design or change UI:",
      "1. Look at existing components and styles first and reuse them.",
      "2. Design every state: empty, loading, error and success.",
      "3. Make it work at 360px wide and on desktop, with visible focus and labelled inputs.",
      "4. Keep motion short (under 200ms) and respect prefers-reduced-motion.",
      "5. Explain the design choice in two or three sentences before you edit.",
    ],
  },
  "code-reviewer": {
    id: "code-reviewer",
    title: "Code reviewer",
    summary: "Reviews recent changes for bugs, unclear code and missing tests.",
    description: "Use after writing or changing code, before committing. Reviews the diff and reports problems by severity.",
    tools: [...READ_ONLY, "Bash"],
    toolsWhy: "Reads code and runs git diff to see what changed. No Edit or Write, so it cannot change code.",
    model: "inherit",
    color: "blue",
    body: () => [
      "You are a careful senior code reviewer.",
      "",
      "1. Run git diff to see the changes.",
      "2. Look for bugs first, then security issues, then readability.",
      "3. Report findings grouped as Must fix, Should fix and Nice to have, each with file and line.",
      "4. Do not rewrite the code yourself. Suggest the change in a short snippet.",
    ],
  },
  "test-writer": {
    id: "test-writer",
    title: "Test writer",
    summary: "Writes focused tests for new or changed logic and runs them.",
    description: "Use when new logic lacks tests or a bug needs a regression test. Writes tests and runs them until they pass.",
    tools: [...READ_ONLY, "Edit", "Write", "Bash"],
    toolsWhy: "Needs to write test files and run the test command. Your settings.json still controls which commands run without asking.",
    model: "inherit",
    color: "green",
    body: (a) => [
      `You write tests for ${a.projectName}. Run them with: ${commandsFor(a).test}`,
      "",
      "1. Test behaviour, not implementation details.",
      "2. Cover the happy path, edge cases and one failure case.",
      "3. Never change application code just to make a test pass. Report the bug instead.",
      "4. Finish by running the tests and pasting the summary.",
    ],
  },
  "security-reviewer": {
    id: "security-reviewer",
    title: "Security reviewer",
    summary: "Looks for leaked secrets, injection, auth gaps and unsafe input handling.",
    description: "Use before releasing or when touching auth, payments, file uploads or user input. Read-only security audit.",
    tools: READ_ONLY,
    toolsWhy: "Strictly read-only. A security reviewer should never change code or run commands.",
    model: "inherit",
    color: "red",
    body: () => [
      "You are an application security reviewer. You only read code.",
      "",
      "Check for: hard-coded secrets, missing input validation, SQL or command injection,",
      "missing authorisation checks, unsafe file handling and data that leaks between users.",
      "",
      "For each finding give: severity (high, medium, low), file and line, why it matters, and the fix.",
      "If you find nothing serious, say so plainly. Do not invent issues.",
    ],
  },
  "docs-writer": {
    id: "docs-writer",
    title: "Docs writer",
    summary: "Keeps the README and code comments accurate and beginner-friendly.",
    description: "Use after a feature is finished, to update the README, setup steps and usage examples.",
    tools: [...READ_ONLY, "Edit", "Write"],
    toolsWhy: "Can edit docs. It cannot run commands.",
    model: "haiku",
    color: "yellow",
    body: (a) => [
      `You write documentation for ${a.projectName}: ${a.description}`,
      "",
      "1. Write for someone new to the project. Use short sentences and real commands.",
      "2. Every command you document must exist in the project.",
      "3. Update the README sections that the change affects. Do not rewrite unrelated parts.",
    ],
  },
  debugger: {
    id: "debugger",
    title: "Debugger",
    summary: "Finds the root cause of an error and proposes the smallest fix.",
    description: "Use when something fails: an error message, a failing test or wrong behaviour. Finds the root cause before fixing.",
    tools: [...READ_ONLY, "Edit", "Bash"],
    toolsWhy: "Needs to run the failing command and make a small fix. Risky commands still ask, per settings.json.",
    model: "inherit",
    color: "orange",
    body: (a) => [
      "You are a debugging specialist.",
      "",
      "1. Reproduce the problem first and capture the exact error.",
      "2. Form a hypothesis, then check it by reading code or adding a temporary log.",
      "3. Fix the root cause with the smallest change. Remove any temporary logs.",
      `4. Confirm the fix by running: ${commandsFor(a).test}`,
    ],
  },
};

export function agentLines(def: AgentDefinition, answers: Answers, bodyOverride?: string): Line[] {
  const body = bodyOverride?.split("\n") ?? def.body(answers);
  return [
    line("---", "Starts the frontmatter: settings Claude Code reads before the instructions."),
    line(`name: ${def.id}`, "The agent's id. Lowercase letters and hyphens. You call it with @agent-" + def.id + "."),
    line(`description: ${yamlString(def.description)}`, "Claude reads this to decide when to hand work to this agent, so it says when to use it."),
    line(`tools: ${def.tools.join(", ")}`, def.toolsWhy),
    line(`model: ${def.model}`, def.model === "inherit" ? "Uses the same model as your main session." : `Runs on ${def.model}, a cheaper and faster model, which is fine for this job.`),
    line(`color: ${def.color}`, "The colour shown in the terminal when this agent is working."),
    line("---", "Ends the frontmatter. Everything below is the agent's instructions (its system prompt)."),
    line(""),
    ...body.map((text, i) => line(text, i === 0 ? "The agent's role and context. It does not see your main chat, only this prompt and the task." : undefined)),
  ];
}
