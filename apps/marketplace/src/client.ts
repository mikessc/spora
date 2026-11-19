// Entrada del navegador del marketplace: solo la mejora de los filtros (se envían al marcar una casilla).
import { type EnhanceContext, mountIslands, registerIsland } from "sibujs";

registerIsland("filters", (ctx: EnhanceContext) => {
  ctx.on(null, "change", () => (ctx.root as HTMLFormElement).requestSubmit());
});
mountIslands();
