import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: ["**/dist/**", "**/node_modules/**", "coverage/**", "apps/api/sample.js"]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended
];
