import { bootstrap, JobQueueService, runMigrations } from "@vendure/core";
import { MarketplaceIndexService } from "./plugins/marketplace/marketplace.plugin";
import { config } from "./vendure-config";

await runMigrations(config);
const app = await bootstrap(config);
// ponytail: sin worker aparte, el server procesa la cola (colecciones, índices). Worker propio cuando haya carga.
await app.get(JobQueueService).start();
// El índice del marketplace se reconstruye al arrancar; después lo mantienen los eventos.
void app
  .get(MarketplaceIndexService)
  .reindexAll()
  .catch((err) => console.error("Índice del marketplace:", err));
