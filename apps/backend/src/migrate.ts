// pnpm --filter @spora/backend migration:generate <nombre>: aplica las migraciones pendientes y escribe una nueva con
// la diferencia entre la base y la config. (Aplicar primero evita generar el esquema entero sobre una base vacía.)
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateMigration, runMigrations } from "@vendure/core";
import { config } from "./vendure-config";

const name = process.argv[2];
if (!name) throw new Error("Falta el nombre de la migración");
await runMigrations(config);
await generateMigration(config, {
  name,
  outputDir: path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations"),
});
