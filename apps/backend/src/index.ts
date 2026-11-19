import { bootstrap, runMigrations } from "@vendure/core";
import { config } from "./vendure-config";

await runMigrations(config);
await bootstrap(config);
