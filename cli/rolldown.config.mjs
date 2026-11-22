import { defineConfig } from "rolldown";

export default defineConfig({
  input: "cli/src/index.ts",
  platform: "node",
  output: { file: "cli/dist/index.js", format: "esm", banner: "#!/usr/bin/env node" },
});
