// pnpm --filter @spora/backend migration:generate <nombre>: compara la base con la config y escribe la migración.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateMigration } from "@vendure/core";
import { config } from "./vendure-config";

const name = process.argv[2];
if (!name) throw new Error("Falta el nombre de la migración");
await generateMigration(config, {
  name,
  outputDir: path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations"),
});
