import { bootstrap, JobQueueService, runMigrations } from "@vendure/core";
import { config } from "./vendure-config";

await runMigrations(config);
const app = await bootstrap(config);
// ponytail: sin worker aparte, el server procesa la cola (colecciones, índices). Worker propio cuando haya carga.
await app.get(JobQueueService).start();
