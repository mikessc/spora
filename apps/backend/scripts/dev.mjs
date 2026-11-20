// `pnpm dev` del backend: Vendure y el Vite del Panel Spora (DashboardPlugin le hace de proxy en /dashboard). Un solo
// proceso Node en vez de `&`, que en Windows no corre en paralelo. Vite corre con tsx porque carga la config de Vendure.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const tsx = require.resolve("tsx/cli");
const children = [
  spawn(process.execPath, [tsx, "--env-file-if-exists=.env", "src/index.ts"], { stdio: "inherit" }),
  spawn(
    process.execPath,
    [
      tsx,
      path.join(path.dirname(require.resolve("vite/package.json")), "bin/vite.js"),
      "--port",
      "5173",
      "--strictPort",
    ],
    {
      stdio: "inherit",
    },
  ),
];
const stop = () => children.forEach((child) => child.kill());
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
children.forEach((child) => child.on("exit", (code) => code && process.exit(code)));
