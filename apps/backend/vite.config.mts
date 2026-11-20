// Panel Spora: el Vendure Dashboard (React) con las pantallas y la marca de Spora (ADR 0007).
//   pnpm --filter @spora/backend dashboard:build   → dist/dashboard (lo sirve DashboardPlugin en /dashboard)
//   pnpm dev                                       → además levanta Vite en 5173 (DashboardPlugin le hace de proxy)
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { vendureDashboardPlugin } from "@vendure/dashboard/vite";
import { defineConfig } from "vite";
import { sporaTheme } from "./src/plugins/panel/theme";

const dir = path.dirname(fileURLToPath(import.meta.url));
// Ver env() en vendure-config.ts: al compilar el panel no hacen falta las variables de producción.
process.env.SPORA_DASHBOARD_BUILD = "1";

export default defineConfig({
  base: "/dashboard",
  build: { outDir: path.join(dir, "dist/dashboard") },
  plugins: [
    vendureDashboardPlugin({
      vendureConfigPath: pathToFileURL(path.join(dir, "src/vendure-config.ts")),
      module: "esm",
      api: { host: "auto", port: "auto" },
      gqlOutputPath: path.join(dir, "src/gql"),
      tempCompilationDir: path.join(dir, ".vendure-dashboard-temp"),
      theme: sporaTheme,
      // Panel en español de Costa Rica (fechas y montos); inglés queda disponible en el menú del usuario.
      i18n: {
        defaultLanguage: "es" as never,
        defaultLocale: "CR",
        availableLanguages: ["es", "en"] as never,
        availableLocales: ["CR"],
      },
    }),
  ],
  resolve: { alias: { "@/gql": path.join(dir, "src/gql/graphql.ts") } },
});
