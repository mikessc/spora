// Datos de ejemplo. Idempotente: lo global se crea una vez y cada tienda solo si no existe.
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  bootstrap,
  Channel,
  ChannelService,
  CollectionService,
  CurrencyCode,
  GlobalSettingsService,
  type InitialData,
  LanguageCode,
  ProductOptionGroupService,
  productIdCollectionFilter,
  ProductService,
  ProductVariantPrice,
  type RequestContext,
  RequestContextService,
  runMigrations,
  TransactionalConnection,
  UserService,
} from "@vendure/core";
import { importProductsFromCsv, populateInitialData } from "@vendure/core/cli/index.js";
import { type CommonAttribute, type CurrencyCode as Currency, isCommonAttribute, slugify } from "@spora/shared";
import type { DesignStyle } from "@spora/themes";
import { MarketplaceCategory } from "./plugins/catalog/entities";
import { CatalogService } from "./plugins/catalog/catalog.service";
import { flatRate, StoreService } from "./plugins/sellers/store.service";
import { config } from "./vendure-config";

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
const brands = ["Sibú", "Café Sur"];

interface StoreSeed {
  slug: string;
  commission: string;
  name: string;
  currency: Currency;
  style: DesignStyle;
  admin: { email: string; password: string; firstName: string; lastName: string };
  theme: Record<string, string>;
  /** [nombre, categoría global, slugs de productos] */
  collections: [string, string, string[]][];
  /** Proveedores de pago además de contra entrega (credenciales de ejemplo; se guardan cifradas). */
  payments: { handler: string; name: string; description: string; args?: Record<string, string> }[];
}

/** Envíos que suman las tiendas de ejemplo a los de siempre (envío propio por zona y retiro). */
const extraShipping = (currency: Currency) => [
  {
    code: "correos",
    name: "Correos de Costa Rica (Pymexpress)",
    description: "Por peso y destino. Entrega en 3 a 5 días hábiles.",
    calculator: { code: "correos-pymexpress", arguments: [] },
    fulfillmentHandler: "correos-pymexpress",
  },
  {
    code: "mensajeria",
    name: "Mensajería con rastreo",
    description: "Entrega con nuestra empresa de mensajería y rastreo en línea.",
    calculator: flatRate(currency === "CRC" ? 200000 : 400),
    fulfillmentHandler: "trackingapp",
  },
];

const paypal = {
  handler: "paypal",
  name: "PayPal",
  description: "Se cobra en dólares al tipo de cambio del día.",
  args: { clientId: "", clientSecret: "", entorno: "sandbox" },
};
const tilopay = {
  handler: "tilopay",
  name: "Tarjeta de crédito o débito",
  description: "Pago seguro con Tilopay.",
  args: { apiUser: "", password: "", key: "" },
};

const stores: StoreSeed[] = [
  {
    slug: "tienda-demo",
    commission: "8",
    name: "Tienda Demo",
    currency: "CRC",
    style: "suave",
    admin: { email: "demo@spora.localhost", password: "demo1234", firstName: "Comercio", lastName: "Demo" },
    theme: {
      primaryColor: "#1d6b4f",
      tagline: "Ropa de algodón hecha en Costa Rica",
      about: "Somos un taller familiar en San José. Cortamos y cosemos cada pieza en pequeños lotes.",
      contactEmail: "hola@tienda-demo.cr",
      contactPhone: "+506 8888 0000",
      shippingPolicy: "Enviamos a todo el país en 2 a 4 días hábiles.\nRetiro gratis en el taller.",
      returnsPolicy: "Cambios de talla dentro de los 15 días, con la prenda sin usar y su etiqueta.",
      privacyPolicy: "Usamos sus datos solo para preparar y enviar su pedido. No los compartimos con terceros.",
    },
    collections: [
      ["Camisetas", "moda-hombre-camisetas", ["camiseta-sibu", "camiseta-volcan"]],
      ["Accesorios", "moda-accesorios", ["gorra-sibu"]],
    ],
    payments: [
      {
        handler: "sinpe-movil",
        name: "SINPE Móvil",
        description: "Pague por SINPE Móvil y suba el comprobante.",
        args: { telefono: "8888-0000", titular: "Tienda Demo S.A." },
      },
      {
        handler: "transferencia",
        name: "Transferencia bancaria",
        description: "Transfiera a nuestra cuenta en colones y suba el comprobante.",
        args: {
          banco: "BAC Credomatic",
          titular: "Tienda Demo S.A.",
          cedula: "3-101-123456",
          iban: "CR05015202001026284066",
          moneda: "CRC",
        },
      },
      paypal,
      tilopay,
    ],
  },
  {
    slug: "cafe-sur",
    commission: "6",
    name: "Café Sur",
    currency: "USD",
    style: "editorial",
    admin: { email: "cafe@spora.localhost", password: "cafe1234", firstName: "Lucía", lastName: "Solano" },
    theme: {
      primaryColor: "#6b4226",
      font: "clasica",
      tagline: "Café de altura, tostado cada semana",
      about: "Compramos directo a fincas de Tarrazú y Los Santos.",
      contactEmail: "hola@cafesur.cr",
      shippingPolicy: "Envíos a todo el país. Pedidos antes del mediodía salen el mismo día.",
    },
    collections: [["Café y chocolate", "cafe-y-alimentos", ["cafe-tarrazu", "chocolate-70"]]],
    payments: [
      {
        handler: "transferencia",
        name: "Transferencia en dólares",
        description: "Transfiera a nuestra cuenta en dólares y suba el comprobante.",
        args: {
          banco: "Banco Nacional",
          titular: "Café Sur Limitada",
          cedula: "3-102-654321",
          iban: "CR21015100010026012345",
          moneda: "USD",
        },
      },
      paypal,
      tilopay,
    ],
  },
];

// El índice del marketplace lo reconstruye el server al arrancar: durante el seed los productos están a medio crear.
process.env.MEILI_HOST = "";
await runMigrations(config);
const app = await bootstrap({ ...config, apiOptions: { ...config.apiOptions, port: 3999 } });
try {
  const connection = app.get(TransactionalConnection);
  const channels = app.get(ChannelService);
  const contexts = app.get(RequestContextService);
  const users = app.get(UserService);
  const identifier = config.authOptions.superadminCredentials!.identifier;
  // Se recarga el superadmin cada vez: un usuario cargado antes de crear un canal no tiene permisos en él.
  const adminCtx = async (channelOrToken?: string) => {
    const user = await users.getUserByEmailAddress(await contexts.create({ apiType: "admin" }), identifier);
    return contexts.create({ apiType: "admin", user, channelOrToken });
  };

  if (!(await connection.rawConnection.getRepository(MarketplaceCategory).count())) {
    const ctx = await adminCtx();
    await app
      .get(GlobalSettingsService)
      .updateSettings(ctx, { availableLanguages: [LanguageCode.es, LanguageCode.en] });
    await populateInitialData(app, initialData);
    // El importador CSV de Vendure 3.8 guarda los precios en la moneda del canal por defecto (FastImporterService):
    // el canal por defecto (el del marketplace) va en CRC y las tiendas en USD se corrigen después de importar.
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
    for (const name of brands) await catalog.approveBrand(ctx, (await catalog.proposeBrand(ctx, name)).id);
    console.log("Datos globales: país, IVA, categorías y marcas.");
  }

  for (const seed of stores) {
    if (await connection.rawConnection.getRepository(Channel).existsBy({ token: seed.slug })) {
      console.log(`La tienda "${seed.slug}" ya existe.`);
      continue;
    }
    await seedStore(seed, await adminCtx(), connection);
    console.log(`Tienda "${seed.slug}" creada. Admin: ${seed.admin.email} / ${seed.admin.password}`);
  }
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await app.close();
  // La cola de trabajos deja timers vivos después de close(): sin esto el proceso no termina.
  process.exit(process.exitCode ?? 0);
}

async function seedStore(seed: StoreSeed, ctx: RequestContext, connection: TransactionalConnection) {
  const store = await connection.withTransaction(ctx, (tx) =>
    app.get(StoreService).createStore(tx, {
      name: seed.name,
      slug: seed.slug,
      baseCurrency: seed.currency,
      designStyle: seed.style,
      commissionPercentage: seed.commission,
      status: "activo",
      administrator: {
        firstName: seed.admin.firstName,
        lastName: seed.admin.lastName,
        emailAddress: seed.admin.email,
        password: seed.admin.password,
      },
    }),
  );

  for (const method of seed.payments) {
    await app.get(StoreService).addPaymentMethod(ctx, store.id, seed.slug, method);
  }
  for (const method of extraShipping(seed.currency)) {
    await app.get(StoreService).addShippingMethod(ctx, store.id, seed.slug, method);
  }

  const csv = path.join(dir, `../seed/tiendas/${seed.slug}.csv`);
  const result = await importProductsFromCsv(app, csv, LanguageCode.es, store);
  // El importador no siempre reporta los errores de parseo: 0 importados también es un fallo.
  if (result.errors?.length || !result.imported) throw new Error(`Importación fallida: ${result.errors?.join("\n")}`);
  if (seed.currency !== "CRC") {
    await connection.rawConnection
      .getRepository(ProductVariantPrice)
      .update({ channelId: store.id }, { currencyCode: CurrencyCode[seed.currency] });
  }

  // El CSV no trae campos de grupos de opciones: se mapean aquí a los atributos comunes (camiseta-sibu-talla → talla).
  const storeCtx = await (async () => {
    const user = await app
      .get(UserService)
      .getUserByEmailAddress(ctx, config.authOptions.superadminCredentials!.identifier);
    return app.get(RequestContextService).create({ apiType: "admin", user, channelOrToken: seed.slug });
  })();
  const groups = app.get(ProductOptionGroupService);
  const products = app.get(ProductService);
  for (const slug of seed.collections.flatMap(([, , slugs]) => slugs)) {
    const product = await products.findOneBySlug(storeCtx, slug, ["optionGroups"]);
    for (const group of product?.optionGroups ?? []) {
      const attribute = slugify(group.code.split("-").pop() ?? "");
      if (isCommonAttribute(attribute)) {
        await groups.update(storeCtx, { id: group.id, customFields: { attribute: attribute as CommonAttribute } });
      }
    }
  }

  // Tema, textos y categorías propias de la tienda (mapeadas a las globales).
  // TrackingApp simulado: llave y secreto de desarrollo (en producción los pega el comercio; se guardan cifrados).
  await app.get(ChannelService).update(storeCtx, {
    id: store.id,
    customFields: { ...seed.theme, trackingAppKey: "tk_simulada", trackingAppWebhookSecret: `whsec_${seed.slug}_dev` },
  });
  for (const [name, marketplaceCategory, slugs] of seed.collections) {
    const productIds = await Promise.all(slugs.map(async (slug) => (await products.findOneBySlug(storeCtx, slug))!.id));
    await app.get(CollectionService).create(storeCtx, {
      translations: [{ languageCode: LanguageCode.es, name, slug: slugify(name), description: "" }],
      filters: [
        {
          code: productIdCollectionFilter.code,
          arguments: [
            { name: "productIds", value: JSON.stringify(productIds) },
            { name: "combineWithAnd", value: "false" },
          ],
        },
      ],
      customFields: { marketplaceCategory },
    });
  }
}
