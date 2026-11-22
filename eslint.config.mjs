import next from "eslint-config-next";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...next,
  ...nextTs,
  { ignores: [".next/**", "node_modules/**", "src/generated/**", "cli/dist/**", "docs/**", "next-env.d.ts"] },
];

export default config;
