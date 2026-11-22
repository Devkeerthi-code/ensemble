import type { Answers, PackageManager } from "./answers";

export type Commands = { install: string; dev?: string; test: string; lint?: string; build?: string; runner: string };

const JS_RUNNERS: Partial<Record<PackageManager, string>> = { npm: "npm run", pnpm: "pnpm", yarn: "yarn", bun: "bun run" };

/** Best-guess commands for the chosen stack. Users can edit them in the generated files. */
export function commandsFor(answers: Answers): Commands {
  const pm = answers.packageManager;
  const js = JS_RUNNERS[pm];
  if (js) {
    return {
      install: `${pm} install`,
      dev: `${js} dev`,
      test: pm === "npm" ? "npm test" : `${pm} test`,
      lint: `${js} lint`,
      build: `${js} build`,
      runner: pm,
    };
  }
  switch (pm) {
    case "pip":
      return { install: "pip install -r requirements.txt", test: "pytest", lint: "ruff check .", runner: "pytest" };
    case "uv":
      return { install: "uv sync", test: "uv run pytest", lint: "uv run ruff check .", runner: "uv" };
    case "poetry":
      return { install: "poetry install", test: "poetry run pytest", lint: "poetry run ruff check .", runner: "poetry" };
    case "maven":
      return { install: "mvn install -DskipTests", test: "mvn test", build: "mvn package", runner: "mvn" };
    case "gradle":
      return { install: "./gradlew build -x test", test: "./gradlew test", build: "./gradlew build", runner: "./gradlew" };
    case "go":
      return { install: "go mod download", test: "go test ./...", lint: "go vet ./...", build: "go build ./...", runner: "go" };
    case "cargo":
      return { install: "cargo fetch", test: "cargo test", lint: "cargo clippy", build: "cargo build", runner: "cargo" };
    default:
      return { install: "dotnet restore", test: "dotnet test", build: "dotnet build", runner: "dotnet" };
  }
}

/** Turns "npm run lint" into the Claude Code permission rule "Bash(npm run lint:*)". */
export function bashRule(command: string): string {
  return `Bash(${command}:*)`;
}

export function stackSummary(answers: Answers): string {
  const parts = [answers.languages.join(", ")];
  if (answers.frameworks.length) parts.push(answers.frameworks.join(", "));
  return parts.join(" with ");
}
