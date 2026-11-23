import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { CAUTION_LEVELS, DEFAULT_ANSWERS, TOOL_IDS, TOOL_LABELS, answersSchema, decodePreset, type Answers, type Caution } from "../../src/lib/setup/answers";
import { AGENT_LIBRARY } from "../../src/lib/setup/agents";
import { generateSetup } from "../../src/lib/setup/generate";
import { defaultAgents, recommendAgents } from "../../src/lib/setup/recommend";
import { fileContent } from "../../src/lib/setup/lines";
import { summariseDiff, writeFiles, type AskOverwrite, type FileSystem } from "./writer";

const HELP = `ensemble-setup: write AI coding tool config files into this folder.

Usage
  npx ensemble-setup init [--preset <code>] [--dry-run] [--yes]

Options
  --preset <code>  Answers from Ensemble Setup Studio (copy the command from the website)
  --dry-run        Show what would be written, write nothing
  --yes            Skip the "write these files?" confirmation. Existing files are still never
                   overwritten without asking; in a non-interactive shell they are skipped.
`;

const nodeFs: FileSystem = {
  read: (p) => readFile(p, "utf8").catch(() => null),
  write: async (p, content) => {
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, content, "utf8");
  },
};

type Prompt = (q: string) => Promise<string>;

async function askAnswers(prompt: Prompt, cwd: string): Promise<Answers> {
  const name = (await prompt(`Project name (${path.basename(cwd)}): `)).trim() || path.basename(cwd);
  const description = (await prompt("What are you building, and for whom? ")).trim();
  stdout.write(TOOL_IDS.map((t, i) => `  ${i + 1}. ${TOOL_LABELS[t]}`).join("\n") + "\n");
  const picks = (await prompt("Which AI tools? Numbers separated by commas (1): ")).split(",").map((s) => Number(s.trim()) - 1);
  const tools = TOOL_IDS.filter((_, i) => picks.includes(i));
  const cautions = Object.keys(CAUTION_LEVELS) as Caution[];
  stdout.write(cautions.map((c, i) => `  ${i + 1}. ${CAUTION_LEVELS[c]}`).join("\n") + "\n");
  const caution = cautions[Number(await prompt("How cautious should the AI be? (2): ")) - 1] ?? "balanced";
  const base = answersSchema.parse({
    ...DEFAULT_ANSWERS,
    projectName: name.replace(/[^\w .-]/g, "-").slice(0, 60),
    description: description.length >= 10 ? description : `${name}: a software project.`,
    tools: tools.length ? tools : ["claude-code"],
    caution,
  });
  const suggested = recommendAgents(base).filter((r) => r.level === "recommended").slice(0, 6);
  if (base.tools.includes("claude-code") && suggested.length) {
    stdout.write(`\nSuggested helper agents for ${base.projectName}:\n${suggested.map((r) => `  - ${AGENT_LIBRARY[r.id].title}: ${r.reasons[0]}`).join("\n")}\n`);
    const keep = (await prompt("Add these? (Y/n) ")).trim().toLowerCase();
    if (keep === "n" || keep === "no") return { ...base, agents: [] };
  }
  return { ...base, agents: defaultAgents(base) };
}

function makeAsk(prompt: Prompt | null): AskOverwrite {
  return async (rel, existing, incoming) => {
    if (!prompt) {
      stdout.write(`  skip   ${rel} (already exists; run interactively to choose)\n`);
      return "skip";
    }
    for (;;) {
      const a = (await prompt(`${rel} already exists and differs. [s]kip, [o]verwrite, [d]iff? (s) `)).trim().toLowerCase();
      if (a === "d") stdout.write(summariseDiff(existing, incoming) + "\n");
      else return a === "o" ? "overwrite" : "skip";
    }
  };
}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (command !== "init") {
    stdout.write(HELP);
    return command === "--help" || command === "-h" ? 0 : 1;
  }
  const flag = (f: string) => rest.includes(f);
  const presetIndex = rest.indexOf("--preset");
  const interactive = Boolean(stdin.isTTY);
  const rl = interactive ? createInterface({ input: stdin, output: stdout }) : null;
  const prompt: Prompt | null = rl ? (q) => rl.question(q) : null;
  try {
    const cwd = process.cwd();
    let answers: Answers;
    if (presetIndex >= 0) {
      const code = rest[presetIndex + 1];
      if (!code) throw new Error("--preset needs a code. Copy the full command from Ensemble Setup Studio.");
      answers = decodePreset(code);
    } else if (prompt) {
      answers = await askAnswers(prompt, cwd);
    } else {
      throw new Error("No --preset given and this shell isn't interactive. Copy the command from Ensemble Setup Studio.");
    }

    const files = generateSetup(answers).map((f) => ({ path: f.path, content: fileContent(f) }));
    stdout.write(`\nEnsemble will write ${files.length} files into ${cwd}:\n${files.map((f) => `  ${f.path}`).join("\n")}\n\n`);
    if (!flag("--yes") && !flag("--dry-run") && prompt) {
      const go = (await prompt("Continue? (Y/n) ")).trim().toLowerCase();
      if (go === "n" || go === "no") return 0;
    }
    const report = await writeFiles(cwd, files, nodeFs, makeAsk(prompt), { dryRun: flag("--dry-run") });
    const label = flag("--dry-run") ? "(dry run, nothing written) " : "";
    stdout.write(`\n${label}created ${report.created.length}, overwritten ${report.overwritten.length}, skipped ${report.skipped.length}, unchanged ${report.unchanged.length}\n`);
    if (answers.team === "team") stdout.write("Tip: add CLAUDE.local.md to your .gitignore. It holds personal notes.\n");
    return 0;
  } catch (e) {
    stdout.write(`\nError: ${(e as Error).message}\n`);
    return 1;
  } finally {
    rl?.close();
  }
}

main(process.argv.slice(2)).then((code) => process.exit(code));
