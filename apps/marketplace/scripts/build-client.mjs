// JS del navegador (solo las islas). `--watch` lo recompila al guardar; `--serve` además levanta el servidor
// (`pnpm dev`). Un solo proceso Node en vez de `&`, que en Windows no corre en paralelo.
import { spawn } from "node:child_process";
import { context } from "esbuild";

const ctx = await context({
  entryPoints: ["src/client.ts"],
  bundle: true,
  format: "iife",
  minify: true,
  target: "es2022",
  define: { __SIBU_DEV__: "false" },
  outfile: "public/marketplace.js",
  logLevel: "info",
});

if (process.argv.includes("--watch")) {
  await ctx.rebuild();
  await ctx.watch();
  if (process.argv.includes("--serve")) spawn("tsx", ["watch", "src/server.ts"], { stdio: "inherit", shell: true });
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
