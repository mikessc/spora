// Datos de ejemplo. Idempotente: si la tienda demo ya existe, no hace nada.
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  bootstrap,
  ChannelService,
  CurrencyCode,
  GlobalSettingsService,
  type InitialData,
  LanguageCode,
  ProductOptionGroup,
  ProductOptionGroupService,
  RequestContextService,
  runMigrations,
  TransactionalConnection,
  UserService,
} from "@vendure/core";
import { importProductsFromCsv, populateInitialData } from "@vendure/core/cli/index.js";
import { CatalogService } from "./plugins/catalog/catalog.service";
import { StoreService } from "./plugins/sellers/store.service";
import { config } from "./vendure-config";

const DEMO = "tienda-demo";
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

/** Árbol de categorías globales: [nombre, hijos]. Los slugs salen del camino (moda-hombre-camisetas). */
type Tree = [string, Tree?][];
const categories: Tree = [
  ["Moda", [["Hombre", [["Camisetas"], ["Pantalones"]]], ["Mujer", [["Vestidos"], ["Blusas"]]], ["Accesorios"]]],
  ["Café y alimentos", [["Café"], ["Chocolate"]]],
  ["Artesanía", [["Cerámica"], ["Textiles"]]],
  ["Tecnología", [["Audio"], ["Accesorios para celular"]]],
];

await runMigrations(config);
const app = await bootstrap({ ...config, apiOptions: { ...config.apiOptions, port: 3999 } });
try {
  const channels = app.get(ChannelService);
  if ((await channels.getChannelFromToken(DEMO)).token === DEMO) {
    console.log(`La tienda "${DEMO}" ya existe; nada que hacer.`);
  } else {
    const contexts = app.get(RequestContextService);
    const superadmin = await app
      .get(UserService)
      .getUserByEmailAddress(
        await contexts.create({ apiType: "admin" }),
        config.authOptions.superadminCredentials!.identifier,
      );
    const ctx = await contexts.create({ apiType: "admin", user: superadmin });
    const connection = app.get(TransactionalConnection);

    await app
      .get(GlobalSettingsService)
      .updateSettings(ctx, { availableLanguages: [LanguageCode.es, LanguageCode.en] });
    await populateInitialData(app, initialData);
    // El importador CSV de Vendure 3.8 guarda los precios en la moneda del canal por defecto (FastImporterService),
    // así que el canal por defecto (el del marketplace) también va en CRC.
    const defaultChannel = await channels.getDefaultChannel(ctx);
    await channels.update(ctx, {
      id: defaultChannel.id,
      defaultCurrencyCode: CurrencyCode.CRC,
      availableCurrencyCodes: [CurrencyCode.CRC],
    });

    const catalog = app.get(CatalogService);
    const plant = async (tree: Tree, parentId: string | number | null) => {
      for (const [i, [name, children]] of tree.entries()) {
        const category = await catalog.createCategory(ctx, { name, parentId, position: i });
        if (children) await plant(children, category.id);
      }
    };
    await plant(categories, null);
    await catalog.approveBrand(ctx, (await catalog.proposeBrand(ctx, "Sibú")).id);

    const store = await connection.withTransaction(ctx, (tx) =>
      app.get(StoreService).createStore(tx, {
        name: "Tienda Demo",
        slug: DEMO,
        baseCurrency: "CRC",
        status: "activo",
        administrator: {
          firstName: "Comercio",
          lastName: "Demo",
          emailAddress: "demo@spora.localhost",
          password: "demo1234",
        },
      }),
    );

    const result = await importProductsFromCsv(app, path.join(dir, "../seed/productos.csv"), LanguageCode.es, store);
    // El importador no siempre reporta los errores de parseo: 0 importados también es un fallo.
    if (result.errors?.length || !result.imported) throw new Error(`Importación fallida: ${result.errors?.join("\n")}`);

    // El CSV no trae campos de grupos de opciones: se mapean aquí a los atributos comunes (camiseta-sibu-talla → talla).
    const groups = app.get(ProductOptionGroupService);
    for (const group of await connection.rawConnection.getRepository(ProductOptionGroup).find()) {
      const attribute = group.code.split("-").pop() as "talla" | "color";
      await groups.update(ctx, { id: group.id, customFields: { attribute } });
    }
    console.log(`Tienda "${DEMO}" creada con ${result.imported} producto(s). Admin: demo@spora.localhost / demo1234`);
  }
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await app.close();
  // La cola de trabajos deja timers vivos después de close(): sin esto el proceso no termina.
  process.exit(process.exitCode ?? 0);
}
