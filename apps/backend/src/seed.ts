// Datos de ejemplo. Idempotente: si la tienda demo ya existe, no hace nada.
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  bootstrap,
  ChannelService,
  CollectionService,
  CurrencyCode,
  GlobalSettingsService,
  type InitialData,
  LanguageCode,
  ProductOptionGroup,
  ProductOptionGroupService,
  productIdCollectionFilter,
  ProductService,
  RequestContextService,
  runMigrations,
  TransactionalConnection,
  UserService,
} from "@vendure/core";
import { importProductsFromCsv, populateInitialData } from "@vendure/core/cli/index.js";
import { slugify } from "@spora/shared";
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
    // Tema, textos y categorías propias de la tienda (mapeadas a las globales).
    // Se vuelve a cargar el superadmin: el de arriba no conoce el canal recién creado.
    const freshAdmin = await app.get(UserService).getUserById(ctx, superadmin!.id);
    const storeCtx = await contexts.create({ apiType: "admin", user: freshAdmin, channelOrToken: DEMO });
    await channels.update(storeCtx, {
      id: store.id,
      customFields: {
        primaryColor: "#1d6b4f",
        font: "sistema",
        tagline: "Ropa de algodón hecha en Costa Rica",
        about: "Somos un taller familiar en San José. Cortamos y cosemos cada pieza en pequeños lotes.",
        contactEmail: "hola@tienda-demo.cr",
        contactPhone: "+506 8888 0000",
        shippingPolicy: "Enviamos a todo el país en 2 a 4 días hábiles.\nRetiro gratis en el taller.",
        returnsPolicy: "Cambios de talla dentro de los 15 días, con la prenda sin usar y su etiqueta.",
        privacyPolicy: "Usamos sus datos solo para preparar y enviar su pedido. No los compartimos con terceros.",
      },
    });
    const productIds = async (...slugs: string[]) =>
      Promise.all(slugs.map(async (slug) => (await app.get(ProductService).findOneBySlug(storeCtx, slug))!.id));
    const collections: [string, string, string[]][] = [
      ["Camisetas", "moda-hombre-camisetas", ["camiseta-sibu", "camiseta-volcan"]],
      ["Accesorios", "moda-accesorios", ["gorra-sibu"]],
    ];
    for (const [name, marketplaceCategory, slugs] of collections) {
      await app.get(CollectionService).create(storeCtx, {
        translations: [{ languageCode: LanguageCode.es, name, slug: slugify(name), description: "" }],
        filters: [
          {
            code: productIdCollectionFilter.code,
            arguments: [
              { name: "productIds", value: JSON.stringify(await productIds(...slugs)) },
              { name: "combineWithAnd", value: "false" },
            ],
          },
        ],
        customFields: { marketplaceCategory },
      });
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
