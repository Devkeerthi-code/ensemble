import next from "eslint-config-next";
import nextTs from "eslint-config-next/typescript";

export default [
  ...next,
  ...nextTs,
  { ignores: [".next/**", "node_modules/**", "src/generated/**", "cli/dist/**", "docs/**"] },
];
