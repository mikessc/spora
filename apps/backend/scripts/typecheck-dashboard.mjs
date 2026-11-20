// Typecheck del código del Panel Spora (src/**/dashboard). @vendure/dashboard publica su código fuente en TypeScript y
// no compila con nuestra configuración estricta: se informan solo los errores de nuestros archivos.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
const { stdout } = spawnSync(
  process.execPath,
  [tsc, "--noEmit", "--pretty", "false", "-p", "tsconfig.dashboard.json"],
  {
    encoding: "utf8",
  },
);
const ours = stdout.split("\n").filter((line) => /^src[/\\]/.test(line));
if (ours.length) {
  console.error(ours.join("\n"));
  process.exit(1);
}
console.log("Panel Spora: sin errores de tipos.");
