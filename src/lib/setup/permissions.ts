import type { Answers, Caution, RiskyId } from "./answers";
import { bashRule, commandsFor } from "./stack";
import type { JsonItem } from "./lines";

export type PermissionSet = {
  allow: JsonItem[];
  ask: JsonItem[];
  deny: JsonItem[];
  defaultMode: "default" | "acceptEdits";
  defaultModeWhy: string;
};

export type RiskyPermission = { id: RiskyId; label: string; warning: string; rule: string; list: "allow" };

/** Opt-in only. Each one is off by default and the UI shows `warning` before it can be switched on. */
export const RISKY_PERMISSIONS: Record<RiskyId, Omit<RiskyPermission, "id" | "list">> = {
  "git-push": {
    label: "Let the AI push to Git without asking",
    warning: "Pushed commits reach your team and CI right away. A bad push can trigger deploys or overwrite shared work.",
    rule: "Bash(git push:*)",
  },
  "delete-files": {
    label: "Let the AI delete files without asking",
    warning: "Deleted files skip the recycle bin. Anything not committed to Git is gone for good.",
    rule: "Bash(rm:*)",
  },
  "install-packages": {
    label: "Let the AI install packages without asking",
    warning: "Packages run their own install scripts. A typo-squatted package can steal secrets from your machine.",
    rule: "Bash(npm install:*)",
  },
  "any-web-fetch": {
    label: "Let the AI fetch any website without asking",
    warning: "Web pages can contain hidden instructions aimed at the AI (prompt injection). Reviewing each fetch keeps you in control.",
    rule: "WebFetch",
  },
};

/** Never allowed, at any caution level. Doctor flags these too. */
export const FORBIDDEN_ALLOW_RULES = ["Bash", "Bash(*)", "Bash(:*)", "*", "Edit(*)", "Write(*)"];

const SECRET_DENIES: JsonItem[] = [
  { value: "Read(./.env)", why: "Blocks reading your .env file, where API keys and passwords usually live." },
  { value: "Read(./.env.*)", why: "Also blocks .env.local, .env.production and similar secret files." },
  { value: "Read(./secrets/**)", why: "Blocks any folder named secrets." },
  { value: "Bash(rm -rf:*)", why: "Recursive force-delete is never allowed. It can wipe a whole folder in one go." },
];

function readOnlyGit(): JsonItem[] {
  return [
    { value: "Bash(git status)", why: "Lets the AI see which files changed. Read-only and safe." },
    { value: "Bash(git diff:*)", why: "Lets the AI read the changes it made. Read-only." },
    { value: "Bash(git log:*)", why: "Lets the AI read commit history to understand context. Read-only." },
  ];
}

function projectCommands(answers: Answers, asks: boolean): JsonItem[] {
  const c = commandsFor(answers);
  const how = asks ? "after asking you" : "without asking";
  const items: JsonItem[] = [{ value: bashRule(c.test), why: `Runs your tests (${c.test}) ${how}, so the AI can check its own work.` }];
  if (c.lint) items.push({ value: bashRule(c.lint), why: `Runs the linter (${c.lint}) ${how}. It only reads code and reports problems.` });
  if (c.build) items.push({ value: bashRule(c.build), why: `Runs a build (${c.build}) ${how} to catch type and compile errors.` });
  return items;
}

const MODE: Record<Caution, { mode: PermissionSet["defaultMode"]; why: string }> = {
  careful: { mode: "default", why: "Default mode: the AI asks before every file edit and every command not listed under allow." },
  balanced: { mode: "default", why: "Default mode: the AI asks before edits and unlisted commands. Safe commands below run without asking." },
  "hands-off": {
    mode: "acceptEdits",
    why: "acceptEdits: file edits are applied without asking, but commands still need approval unless allowed below. Review changes with git diff.",
  },
};

export function buildPermissions(answers: Answers): PermissionSet {
  const allow: JsonItem[] = [...readOnlyGit()];
  const ask: JsonItem[] = [];
  const deny: JsonItem[] = [...SECRET_DENIES];

  if (answers.caution === "careful") {
    ask.push(...projectCommands(answers, true));
  } else {
    allow.push(...projectCommands(answers, false));
  }

  ask.push({ value: "Bash(git commit:*)", why: "Commits ask first, so you read the message and the changes before they are saved." });
  if (answers.caution === "careful") {
    deny.push({ value: "Bash(git push:*)", why: "Careful mode: the AI can never push. You push yourself." });
    deny.push({ value: "Bash(curl:*)", why: "Careful mode: blocks curl so nothing can be uploaded from your machine by a command." });
  } else {
    ask.push({ value: "Bash(curl:*)", why: "curl can send data anywhere, so it always asks first." });
  }

  for (const id of answers.riskyOptIns) {
    const risky = RISKY_PERMISSIONS[id];
    const denyIndex = deny.findIndex((d) => d.value === risky.rule);
    if (denyIndex >= 0) deny.splice(denyIndex, 1);
    allow.push({ value: risky.rule, why: `You opted in: ${risky.warning}`, risk: true });
  }

  const mode = MODE[answers.caution];
  return { allow, ask, deny, defaultMode: mode.mode, defaultModeWhy: mode.why };
}
