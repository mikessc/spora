// Datos de ejemplo de la Fase 0: un canal (tienda) en CRC con un producto de 6 variantes.
// Idempotente: si el canal ya existe, no hace nada.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { importProductsFromCsv, populateInitialData } from "@vendure/core/cli/index.js";
import {
  bootstrap,
  ChannelService,
  CurrencyCode,
  GlobalSettingsService,
  LanguageCode,
  RequestContextService,
  StockLocationService,
  UserService,
  ZoneService,
  type InitialData,
} from "@vendure/core";
import { config } from "./vendure-config.js";

const TOKEN = "tienda-demo";
const dir = path.dirname(fileURLToPath(import.meta.url));

const initialData: InitialData = {
  defaultLanguage: LanguageCode.es,
  defaultZone: "Costa Rica",
  countries: [{ name: "Costa Rica", code: "CR", zone: "Costa Rica" }],
  taxRates: [{ name: "IVA", percentage: 13 }],
  shippingMethods: [],
  paymentMethods: [],
  collections: [],
};

const app = await bootstrap({ ...config, apiOptions: { ...config.apiOptions, port: 3999 } });
try {
  const channels = app.get(ChannelService);
  if (await channels.getChannelFromToken(TOKEN).then((c) => c.token === TOKEN)) {
    console.log(`El canal "${TOKEN}" ya existe; nada que hacer.`);
  } else {
    const requestContexts = app.get(RequestContextService);
    const superadmin = await app
      .get(UserService)
      .getUserByEmailAddress(
        await requestContexts.create({ apiType: "admin" }),
        config.authOptions.superadminCredentials!.identifier,
      );
    const ctx = await requestContexts.create({ apiType: "admin", user: superadmin });
    await app.get(GlobalSettingsService).updateSettings(ctx, {
      availableLanguages: [LanguageCode.es, LanguageCode.en],
    });
    await populateInitialData(app, initialData);
    // El importador CSV de Vendure 3.8 guarda los precios en la moneda del canal por defecto
    // (FastImporterService), así que el canal por defecto (el del marketplace) también va en CRC.
    const defaultChannel = await channels.getDefaultChannel(ctx);
    await channels.update(ctx, {
      id: defaultChannel.id,
      defaultCurrencyCode: CurrencyCode.CRC,
      availableCurrencyCodes: [CurrencyCode.CRC],
    });
    const zone = (await app.get(ZoneService).getAllWithMembers(ctx)).find((z) => z.name === "Costa Rica");
    if (!zone) throw new Error("No se creó la zona Costa Rica");
    const created = await channels.create(ctx, {
      code: TOKEN,
      token: TOKEN,
      defaultLanguageCode: LanguageCode.es,
      availableLanguageCodes: [LanguageCode.es],
      defaultCurrencyCode: CurrencyCode.CRC,
      availableCurrencyCodes: [CurrencyCode.CRC],
      pricesIncludeTax: true,
      defaultTaxZoneId: zone.id,
      defaultShippingZoneId: zone.id,
    });
    if (!("id" in created)) throw new Error(`No se pudo crear el canal: ${created.message}`);
    const stockLocations = app.get(StockLocationService);
    await stockLocations.assignStockLocationsToChannel(ctx, {
      stockLocationIds: [(await stockLocations.defaultStockLocation(ctx)).id],
      channelId: created.id,
    });
    const result = await importProductsFromCsv(app, path.join(dir, "../seed/productos.csv"), LanguageCode.es, created);
    if (result.errors?.length) throw new Error(result.errors.join("\n"));
    console.log(`Canal "${TOKEN}" creado con ${result.imported} producto(s).`);
  }
} finally {
  await app.close();
}
