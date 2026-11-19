// JS del navegador (solo las islas). `--watch` lo recompila al guardar; `--serve` además levanta el servidor
// (`pnpm dev`). Un solo proceso Node en vez de `&`, que en Windows no corre en paralelo. `node --watch` y no
// `tsx watch`: bajo turbo en Windows `tsx watch` no llega a levantar el servidor.
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
  if (process.argv.includes("--serve"))
    spawn(process.execPath, ["--watch", "--import", "tsx", "src/server.ts"], { stdio: "inherit" });
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
