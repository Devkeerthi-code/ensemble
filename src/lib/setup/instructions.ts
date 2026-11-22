import { PROJECT_TYPES, TOOL_LABELS, type Answers } from "./answers";
import { blank, line, versionComment, type Line } from "./lines";
import { commandsFor, stackSummary } from "./stack";

/** Shared project rules. Written once into AGENTS.md (or CLAUDE.md alone) and referenced by every other tool. */
export function projectRules(a: Answers): Line[] {
  const c = commandsFor(a);
  const commands: Line[] = [
    line(`- Install: \`${c.install}\``, "Exact commands save the AI from guessing, which is where many wrong edits start."),
  ];
  if (c.dev) commands.push(line(`- Run locally: \`${c.dev}\``));
  commands.push(line(`- Test: \`${c.test}\``, "The AI runs this to check its own work before saying it is done."));
  if (c.lint) commands.push(line(`- Lint: \`${c.lint}\``));
  if (c.build) commands.push(line(`- Build: \`${c.build}\``));

  return [
    line("## Project", "A short overview so the AI knows what it is working on."),
    line(`${a.projectName}: ${a.description}`),
    line(`Type: ${PROJECT_TYPES[a.projectType]}. Stack: ${stackSummary(a)}.`, "Naming the stack stops the AI suggesting libraries you don't use."),
    blank(),
    line("## Commands", "Commands the AI may need. Edit them if your project uses different ones."),
    ...commands,
    blank(),
    line("## How to work here", "House rules. Short, specific rules work better than long essays."),
    line("- Make small, focused changes. Explain the plan before large edits.", "Small changes are easier for you to review and undo."),
    line("- Run the tests after every change and fix failures before finishing."),
    line("- Never commit secrets. Read keys from environment variables.", "AI tools sometimes paste keys into code. This rule makes them stop and ask."),
    line("- Ask before adding a new dependency.", "Every package is code you now trust. You decide what comes in."),
    ...(a.team === "team"
      ? [
          line("- Follow the existing code style and folder structure. Match nearby files.", "In a team, consistency matters more than personal taste."),
          line("- Write commit messages as: type: short summary (feat, fix, docs, test, chore).", "A shared commit format keeps history readable for everyone."),
        ]
      : [line("- Prefer readable code over clever code. Add short comments only where the why is not obvious.")]),
  ];
}

export function agentsMd(a: Answers): Line[] {
  const readers = a.tools.filter((t) => t !== "claude-code").map((t) => TOOL_LABELS[t]);
  return [
    line("# AGENTS.md", `An open format read by ${readers.join(", ") || "many coding agents"}. One file, many tools.`),
    versionComment(),
    blank(),
    ...projectRules(a),
  ];
}

export function claudeMd(a: Answers, sharesAgentsMd: boolean): Line[] {
  const head: Line[] = [line(`# ${a.projectName}`, "CLAUDE.md is loaded into every Claude Code session in this folder."), versionComment(), blank()];
  const shared = sharesAgentsMd
    ? [
        line("@AGENTS.md", "Imports AGENTS.md, so your rules live in one file and every tool reads the same thing."),
        blank(),
      ]
    : projectRules(a);
  const claudeOnly: Line[] = [
    blank(),
    line("## Claude Code", "Notes only Claude Code needs."),
    line("- Use the subagents in .claude/agents/ for review, tests and debugging when they fit the task.", "Reminds Claude that your helpers exist so it delegates to them."),
    line("- Permissions live in .claude/settings.json. Do not ask to change them; tell me instead.", "Keeps safety settings under your control, not the AI's."),
  ];
  if (a.team === "team") {
    claudeOnly.push(line("- Personal preferences go in CLAUDE.local.md, which is not committed.", "Keeps one person's habits out of the shared file."));
  }
  return [...head, ...shared, ...claudeOnly];
}

export function claudeLocalMd(): Line[] {
  return [
    line("# My local notes", "CLAUDE.local.md is personal. Claude Code reads it, but it is git-ignored, so teammates never see it."),
    blank(),
    line("- (Example) I prefer short explanations.", "Replace these with your own preferences."),
    line("- (Example) My local API runs on http://localhost:4000."),
  ];
}

export function geminiMd(a: Answers, sharesAgentsMd: boolean): Line[] {
  return [
    line(`# ${a.projectName}`, "GEMINI.md is the context file Gemini CLI loads for this project."),
    versionComment(),
    blank(),
    ...(sharesAgentsMd
      ? [line("@./AGENTS.md", "Gemini CLI's import syntax. Pulls in the shared rules so you maintain them once.")]
      : projectRules(a)),
  ];
}

export function geminiSettings(): Line[] {
  return [
    line("{", "Gemini CLI project settings."),
    line('  "context": {'),
    line('    "fileName": ["GEMINI.md", "AGENTS.md"]', "Tells Gemini CLI to load both files, so it also reads AGENTS.md directly."),
    line("  }"),
    line("}"),
  ];
}

export function cursorRule(a: Answers, sharesAgentsMd: boolean): Line[] {
  return [
    line("---", "Cursor rule frontmatter."),
    line(`description: Project rules for ${a.projectName}`, "Shown in Cursor's rule list."),
    line("alwaysApply: true", "Applies to every chat and agent request in this project."),
    line("---"),
    blank(),
    ...(sharesAgentsMd
      ? [
          line("Follow the rules in AGENTS.md at the project root.", "Cursor reads AGENTS.md too. This rule makes sure it is always applied."),
          line("Keep changes small and run the tests before finishing."),
        ]
      : projectRules(a)),
  ];
}

export function cursorTestRule(a: Answers): Line[] {
  return [
    line("---", "A second rule that only applies to test files."),
    line("description: How to write tests in this project"),
    line('globs: "**/*.{test,spec}.*,**/tests/**"', "Attaches this rule only when matching files are in play, so it doesn't cost context elsewhere."),
    line("alwaysApply: false", "false plus globs means: apply automatically to matching files only."),
    line("---"),
    blank(),
    line(`- Run tests with \`${commandsFor(a).test}\`.`),
    line("- One behaviour per test. Name tests after what they check."),
    line("- Never delete a failing test to make the suite pass."),
  ];
}

export function copilotInstructions(a: Answers, sharesAgentsMd: boolean): Line[] {
  return [
    line(`# Copilot instructions for ${a.projectName}`, "GitHub Copilot adds this file to every chat and code review request in this repo."),
    versionComment(),
    blank(),
    ...(sharesAgentsMd
      ? [line("The full project rules are in AGENTS.md at the repository root. Follow them.", "Copilot's coding agent reads AGENTS.md as well. This line points chat there too.")]
      : []),
    ...projectRules(a),
  ];
}

export function copilotTestInstructions(a: Answers): Line[] {
  return [
    line("---", "Path-specific Copilot instructions."),
    line('applyTo: "**/*.test.*,**/*.spec.*"', "Only used when Copilot works on files matching these globs."),
    line("---"),
    blank(),
    line(`Write tests that run with \`${commandsFor(a).test}\`. Cover the happy path, an edge case and a failure.`),
  ];
}
