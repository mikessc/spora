// Regenera data/nomenclator-cr.json desde el nomenclátor de TrackingApp (mikessc/TrackingApp,
// packages/db/seed-data/geo_areas_cr.json), para que las direcciones usen los mismos códigos.
//   node scripts/nomenclator-desde-trackingapp.mjs <ruta a geo_areas_cr.json>
import { readFileSync, writeFileSync } from "node:fs";

const source = process.argv[2];
if (!source) throw new Error("Falta la ruta a geo_areas_cr.json de TrackingApp");
const areas = JSON.parse(readFileSync(source, "utf8"));
// Niveles 1-3 (provincia, cantón, distrito): los barrios no hacen falta para una dirección de envío.
const rows = areas
  .filter((a) => a.level <= 3)
  .map((a) =>
    a.level === 3 ? [a.level, a.code, a.name, a.parentCode, a.postalCode] : [a.level, a.code, a.name, a.parentCode],
  );
writeFileSync(new URL("../data/nomenclator-cr.json", import.meta.url), JSON.stringify(rows));
console.log(`${rows.length} áreas escritas`);
