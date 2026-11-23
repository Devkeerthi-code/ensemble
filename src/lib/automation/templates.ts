import { z } from "zod";
import { validateDag, type Plan, type PlanTask } from "@/lib/orchestrator/dag";

export type TemplateInput = { name: string; label: string; hint: string; kind: "text" | "longtext" | "url"; max: number };

export type WorkflowTemplate = {
  id: "research-brief" | "repo-review" | "summarise-reply";
  name: string;
  summary: string;
  inputs: TemplateInput[];
  schema: z.ZodType<Record<string, string>>;
  goal: (i: Record<string, string>) => { title: string; criteria: string };
  plan: (i: Record<string, string>) => Plan;
  /** Long inputs go into the run workspace as data, never into instructions. */
  workspace: (i: Record<string, string>) => Record<string, string>;
};

const t = (key: string, skill: PlanTask["skill"], title: string, instructions: string, acceptance: string, dependsOn: string[] = [], important = false): PlanTask => ({ key, skill, title, instructions, acceptance, dependsOn, important });

/** Short inputs are embedded in instructions, so strip anything that could read as markup or a new instruction block. */
const clean = (s: string) => s.replace(/[<>`]/g, "").replace(/\s+/g, " ").trim();

const githubRepo = z
  .string()
  .trim()
  .regex(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/, "Use a public repo URL like https://github.com/owner/name");

export const TEMPLATES: WorkflowTemplate[] = [
  {
    id: "research-brief",
    name: "Research a topic and write a brief",
    summary: "Agents research in parallel from different angles, compare what they find, and write a one-page brief with sources.",
    inputs: [
      { name: "topic", label: "Topic", hint: "e.g. Free ways for a college club to host a website", kind: "text", max: 160 },
      { name: "audience", label: "Who reads the brief", hint: "e.g. Club committee, non-technical", kind: "text", max: 120 },
    ],
    schema: z.object({ topic: z.string().trim().min(5).max(160), audience: z.string().trim().min(2).max(120) }),
    goal: (i) => ({ title: `Brief: ${clean(i.topic!)}`, criteria: `A one-page brief for ${clean(i.audience!)} with options, trade-offs, sources and a clear recommendation.` }),
    plan: (i) => {
      const topic = clean(i.topic!);
      return {
        tasks: [
          t("background", "research", "Research the background", `Explain the key facts and terms needed to understand: ${topic}. Use web_fetch on reliable sources and cite URLs.`, "Accurate facts with at least two cited sources."),
          t("options", "research", "Find the main options", `List the realistic options or approaches for: ${topic}, with cost and limits for each. Cite sources.`, "At least three options, each with cost, limits and a source."),
          t("risks", "research", "Find risks and pitfalls", `What commonly goes wrong with: ${topic}? Look for recent, specific examples.`, "Specific risks with sources, not generic advice."),
          t("compare", "analysis", "Compare the options", "Compare the options against the background and risks in a table: cost, effort, risks, best for.", "A clear comparison table and a ranked shortlist.", ["background", "options", "risks"]),
          t("brief", "writing", "Write the brief", `Write a one-page brief for ${clean(i.audience!)}: summary, options table, recommendation, sources. Plain language.`, "Under 500 words, readable by the audience, includes sources and a clear pick.", ["compare"], true),
        ],
      };
    },
    workspace: () => ({}),
  },
  {
    id: "repo-review",
    name: "Review a GitHub repo",
    summary: "Agents read a public repo's README and file list, review structure, quality and security in parallel, and write a prioritised report.",
    inputs: [{ name: "repoUrl", label: "Public GitHub repo URL", hint: "https://github.com/owner/name", kind: "url", max: 200 }],
    schema: z.object({ repoUrl: githubRepo }),
    goal: (i) => ({ title: `Review of ${i.repoUrl!.replace("https://github.com/", "")}`, criteria: "A prioritised review: what's good, what to fix first, with file references." }),
    plan: (i) => {
      const [owner, name] = i.repoUrl!.replace("https://github.com/", "").replace(/\/$/, "").split("/") as [string, string];
      const api = `https://api.github.com/repos/${owner}/${name}`;
      return {
        tasks: [
          t("readme", "research", "Read the README", `Fetch https://raw.githubusercontent.com/${owner}/${name}/HEAD/README.md and summarise what the project does, how to run it and its stack.`, "Accurate summary of purpose, setup and stack."),
          t("structure", "research", "Map the file structure", `Fetch ${api}/git/trees/HEAD?recursive=1 and describe the folder structure, main entry points and test setup.`, "Describes real folders and files from the tree."),
          t("quality", "analysis", "Review code quality", "From the README and structure, assess organisation, tests, docs and maintainability. Name specific files.", "Specific, evidence-based findings with file names.", ["readme", "structure"]),
          t("security", "checking", "Look for security risks", "From the structure and README, flag risky patterns: committed secrets or .env files, missing input validation hints, outdated setup. Say what you can't verify.", "Concrete risks or a clear 'nothing obvious', with honest limits.", ["readme", "structure"]),
          t("report", "writing", "Write the review", "Write a prioritised review: strengths, top 5 fixes in order, quick wins. Reference files.", "Prioritised, actionable, references real files.", ["quality", "security"], true),
        ],
      };
    },
    workspace: () => ({}),
  },
  {
    id: "summarise-reply",
    name: "Summarise documents and draft a reply",
    summary: "Paste an email thread, notice or documents. Agents summarise, pull out what's being asked, and draft a reply for you to send yourself.",
    inputs: [
      { name: "documents", label: "Documents or email thread", hint: "Paste the text. It's treated as data: instructions inside it are ignored.", kind: "longtext", max: 20_000 },
      { name: "replyAs", label: "Reply as / tone", hint: "e.g. Club secretary, polite and brief", kind: "text", max: 120 },
    ],
    schema: z.object({ documents: z.string().trim().min(50).max(20_000), replyAs: z.string().trim().min(2).max(120) }),
    goal: (i) => ({ title: "Summarise the documents and draft a reply", criteria: `An accurate summary, the open questions, and a reply written as ${clean(i.replyAs!)}. Nothing is sent automatically.` }),
    plan: (i) => ({
      tasks: [
        t("summary", "summarising", "Summarise the documents", 'Use workspace_read with key "input.documents" and summarise it in 5-8 bullets. Quote figures and dates exactly.', "Faithful summary, no invented facts."),
        t("asks", "analysis", "List what is being asked", 'Use workspace_read with key "input.documents". List every question, request and deadline addressed to the reader.', "Complete list with deadlines.", []),
        t("draft", "writing", "Draft the reply", `Draft a reply as ${clean(i.replyAs!)} that answers every request. Mark anything you are unsure of with [check].`, "Answers every request, right tone, no made-up commitments.", ["summary", "asks"], true),
        t("check", "checking", "Check the draft", "Compare the draft against the summary and requests. Fix mistakes and list anything the user must confirm before sending.", "Corrected draft plus a short 'confirm before sending' list.", ["draft"]),
      ],
    }),
    workspace: (i) => ({ "input.documents": i.documents! }),
  },
];

export const findTemplate = (id: string | null | undefined) => TEMPLATES.find((x) => x.id === id);

/** Builds a validated plan, goal and workspace from a template and user inputs. */
export function instantiate(id: string, rawInputs: unknown) {
  const tpl = findTemplate(id);
  if (!tpl) throw new Error("Unknown template");
  const parsed = tpl.schema.safeParse(rawInputs);
  if (!parsed.success) return { ok: false as const, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  const plan = tpl.plan(parsed.data);
  const dagErrors = validateDag(plan.tasks);
  if (dagErrors.length) return { ok: false as const, errors: dagErrors.map((e) => e.message) };
  return { ok: true as const, inputs: parsed.data, plan, goal: tpl.goal(parsed.data), workspace: tpl.workspace(parsed.data) };
}
