import { Controller, Get, Redirect } from "@nestjs/common";
import { PluginCommonModule, VendurePlugin } from "@vendure/core";

/** Las páginas sueltas del MVP ahora viven en el Panel Spora: quedan las direcciones viejas. */
@Controller("panel")
class LegacyPanelRedirects {
  @Get("comisiones")
  @Redirect("/dashboard/comisiones", 301)
  commissions() {}

  @Get("tienda")
  @Redirect("/dashboard/mi-tienda", 301)
  store() {}
}

/**
 * Panel Spora (ADR 0007): las pantallas y la marca de Spora dentro del Vendure Dashboard. No agrega API propia: usa la
 * de cada plugin (tienda, comisiones, catálogo, envíos). La extensión está en ./dashboard/index.tsx.
 */
@VendurePlugin({
  imports: [PluginCommonModule],
  controllers: [LegacyPanelRedirects],
  dashboard: "./dashboard/index.tsx",
  compatibility: "^3.0.0",
})
export class PanelPlugin {}
