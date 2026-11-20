import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules",
      "**/dist",
      "**/.turbo",
      "**/static",
      "**/public/*.js",
      "**/migrations",
      // Panel Spora: tipos generados por gql.tada y la config compilada por el Dashboard.
      "apps/backend/src/gql",
      "apps/backend/.vendure-dashboard-temp",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.node, ...globals.browser } } },
);
