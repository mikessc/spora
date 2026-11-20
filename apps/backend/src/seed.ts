// Datos de ejemplo. Idempotente: lo global se crea una vez y cada tienda solo si no existe.
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
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
  Order,
  OrderService,
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
import { createShopClient } from "@spora/api-client";
import {
  type CommonAttribute,
  crPlace,
  type CurrencyCode as Currency,
  isCommonAttribute,
  slugify,
} from "@spora/shared";
import { type DesignStyle, paletteRoles, suggestedPalettes } from "@spora/themes";
import { MarketplaceCategory } from "./plugins/catalog/entities";
import { CatalogService } from "./plugins/catalog/catalog.service";
import { flatRate, paletteField, StoreService } from "./plugins/sellers/store.service";
import { type ShipmentEventKind, ShipmentEventsService } from "./plugins/shipping/shipping.plugin";
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
const brands = ["Sibú", "Café Sur", "Barro y Telar", "Voltio"];
/** Una marca propuesta por una tienda y todavía sin aprobar: no aparece en el marketplace hasta que Spora la apruebe. */
const proposedBrand = "Artesanías del Sur";

/** Los campos del canal de una de las paletas sugeridas (@spora/themes): cada tienda de ejemplo, la de su rubro. */
const palette = (name: string) => {
  const chosen = suggestedPalettes.find((p) => p.name === name)!.palette;
  return Object.fromEntries(paletteRoles.map((role) => [paletteField(role), chosen[role]]));
};

interface StoreSeed {
  slug: string;
  commission: string;
  name: string;
  currency: Currency;
  style: DesignStyle;
  admin: { email: string; password: string; firstName: string; lastName: string };
  theme: Record<string, string>;
  /** [nombre, categoría global]: cada producto va a la de su categoría global más específica. */
  collections: [string, string][];
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
      ...palette("Algodón y bosque"),
      tagline: "Ropa de algodón hecha en Costa Rica",
      about: "Somos un taller familiar en San José. Cortamos y cosemos cada pieza en pequeños lotes.",
      contactEmail: "hola@tienda-demo.cr",
      contactPhone: "+506 8888 0000",
      shippingPolicy: "Enviamos a todo el país en 2 a 4 días hábiles.\nRetiro gratis en el taller.",
      returnsPolicy: "Cambios de talla dentro de los 15 días, con la prenda sin usar y su etiqueta.",
      privacyPolicy: "Usamos sus datos solo para preparar y enviar su pedido. No los compartimos con terceros.",
    },
    collections: [
      ["Hombre", "moda-hombre"],
      ["Mujer", "moda-mujer"],
      ["Accesorios", "moda-accesorios"],
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
      ...palette("Café de altura"),
      font: "clasica",
      tagline: "Café de altura, tostado cada semana",
      about: "Compramos directo a fincas de Tarrazú y Los Santos.",
      contactEmail: "hola@cafesur.cr",
      shippingPolicy: "Envíos a todo el país. Pedidos antes del mediodía salen el mismo día.",
    },
    collections: [
      ["Café", "cafe-y-alimentos-cafe"],
      ["Chocolate", "cafe-y-alimentos-chocolate"],
    ],
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
  {
    slug: "barro-telar",
    commission: "10",
    name: "Barro y Telar",
    currency: "CRC",
    style: "pop",
    admin: { email: "barro@spora.localhost", password: "barro1234", firstName: "Rocío", lastName: "Chaves" },
    theme: {
      ...palette("Barro y añil"),
      font: "redondeada",
      tagline: "Artesanía costarricense hecha a mano",
      about: "Trabajamos con artesanas de Guaitil y del territorio boruca. Cada pieza es única.",
      contactEmail: "hola@barroytelar.cr",
      contactPhone: "+506 8777 1111",
      shippingPolicy: "Empacamos cada pieza con cuidado. Envíos a todo el país en 3 a 5 días hábiles.",
      returnsPolicy: "Si una pieza llega dañada, la reponemos o le devolvemos el dinero.",
    },
    collections: [
      ["Cerámica", "artesania-ceramica"],
      ["Textiles", "artesania-textiles"],
      ["Otras artesanías", "artesania"],
    ],
    payments: [
      {
        handler: "sinpe-movil",
        name: "SINPE Móvil",
        description: "Pague por SINPE Móvil y suba el comprobante.",
        args: { telefono: "8777-1111", titular: "Barro y Telar" },
      },
      tilopay,
    ],
  },
  {
    slug: "voltio",
    commission: "5",
    name: "Voltio",
    currency: "USD",
    style: "minimal",
    admin: { email: "voltio@spora.localhost", password: "voltio1234", firstName: "Diego", lastName: "Arias" },
    theme: {
      ...palette("Circuito"),
      font: "geometrica",
      tagline: "Accesorios de tecnología con garantía",
      about: "Audio y accesorios para celular. Garantía de 6 meses en todo.",
      contactEmail: "ventas@voltio.cr",
      shippingPolicy: "Envío gratis con Correos en pedidos de más de $50.",
      returnsPolicy: "Garantía de 6 meses por defectos de fábrica.",
    },
    collections: [
      ["Audio", "tecnologia-audio"],
      ["Accesorios para celular", "tecnologia-accesorios-para-celular"],
    ],
    payments: [paypal, tilopay],
  },
];

/** Cliente de prueba y sus pedidos (ver seedCustomerOrders). */
const CUSTOMER = {
  email: "cliente@spora.localhost",
  password: "cliente1234",
  firstName: "Ana",
  lastName: "Cliente",
  phone: "8888-7777",
};
const ORDERS: { store: string; product: string; shipping: string; payment: string; events: ShipmentEventKind[] }[] = [
  {
    store: "tienda-demo",
    product: "camiseta-sibu",
    shipping: "Mensajería con rastreo",
    payment: "contra-entrega",
    events: ["en_camino", "entregado"],
  },
  {
    store: "voltio",
    product: "audifonos-inalambricos",
    shipping: "Correos de Costa Rica (Pymexpress)",
    payment: "contra-entrega",
    events: ["en_camino"],
  },
  { store: "barro-telar", product: "taza-de-barro", shipping: "Retiro en local", payment: "sinpe-movil", events: [] },
  { store: "cafe-sur", product: "cafe-tarrazu", shipping: "Envío a domicilio", payment: "transferencia", events: [] },
  {
    store: "tienda-demo",
    product: "gorra-sibu",
    shipping: "Envío a domicilio",
    payment: "contra-entrega",
    events: ["en_camino", "devuelto"],
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
    await catalog.proposeBrand(ctx, proposedBrand);
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
  await seedCustomerOrders(adminCtx);
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

  // seed/tiendas/<tienda>.csv (hecho a mano) y <tienda>.mas.csv (de generar-catalogo.mjs).
  for (const file of [`${seed.slug}.csv`, `${seed.slug}.mas.csv`]) {
    const csv = path.join(dir, "../seed/tiendas", file);
    if (!existsSync(csv)) continue;
    const result = await importProductsFromCsv(app, csv, LanguageCode.es, store);
    // El importador no siempre reporta los errores de parseo: 0 importados también es un fallo.
    if (result.errors?.length || !result.imported) {
      throw new Error(`Importación fallida (${file}): ${result.errors?.join("\n")}`);
    }
  }
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
  const products = (await app.get(ProductService).findAll(storeCtx, { take: 500 }, ["optionGroups"])).items;
  for (const product of products) {
    for (const group of product.optionGroups ?? []) {
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
  // Cada producto va a la categoría de la tienda más específica que lo abarca (artesania-ceramica antes que artesania).
  const within = (category: string, parent: string) => category === parent || category.startsWith(`${parent}-`);
  const collectionOf = (category: string) =>
    seed.collections
      .filter(([, parent]) => within(category, parent))
      .sort(([, a], [, b]) => b.length - a.length)[0]?.[1];
  for (const [name, marketplaceCategory] of seed.collections) {
    const productIds = products
      .filter((p) => collectionOf(p.customFields.marketplaceCategory ?? "") === marketplaceCategory)
      .map((p) => p.id);
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

/**
 * Cliente de prueba con pedidos en varios estados (MVP.md, M7). Se compra por la Shop API, como un cliente de verdad;
 * la tienda despacha y el transportista reporta por los mismos servicios que usa el Admin UI y los webhooks.
 */
async function seedCustomerOrders(adminCtx: (token?: string) => Promise<RequestContext>) {
  const ctx = await adminCtx();
  if (await app.get(UserService).getUserByEmailAddress(ctx, CUSTOMER.email)) {
    console.log("El cliente de prueba ya existe.");
    return;
  }
  const shopApi = `http://localhost:3999/${config.apiOptions.shopApiPath}`;
  let cookie = "";
  const shop = (store?: string) =>
    createShopClient({
      url: shopApi,
      channelToken: store,
      cookie,
      onSetCookie: (all) => (cookie = all.map((c) => c.split(";")[0]).join("; ")),
    });
  await shop().register({ ...CUSTOMER });
  await shop().login(CUSTOMER.email, CUSTOMER.password);
  const place = crPlace("10201")!;
  const address = {
    fullName: `${CUSTOMER.firstName} ${CUSTOMER.lastName}`,
    phone: CUSTOMER.phone,
    street: "De la iglesia 100 m sur, casa amarilla",
    province: place.province.name,
    canton: place.canton.name,
    district: place.district.name,
    districtCode: place.district.code,
    postalCode: place.district.postalCode,
  };
  await shop("tienda-demo").saveAddress(address);

  for (const plan of ORDERS) {
    const client = shop(plan.store);
    const product = await client.product(plan.product);
    const variant = product?.variants.find((v) => v.stockLevel !== "OUT_OF_STOCK");
    if (!variant) throw new Error(`Sin stock: ${plan.product}`);
    await client.addItemToOrder(variant.id, 1);
    await client.setShippingAddress(address);
    const shipping = (await client.shippingOptions()).find((o) => o.name === plan.shipping);
    await client.setShippingMethod(shipping!.id);
    const payment = (await client.paymentOptions()).find((o) => o.code === `${plan.store}-${plan.payment}`);
    const order = await client.pay(payment!.code);
    if (!plan.events.length) continue;

    // La tienda despacha (crea la guía con el transportista del envío elegido) y el transportista reporta.
    const storeCtx = await adminCtx(plan.store);
    const entity = await app
      .get(TransactionalConnection)
      .getRepository(storeCtx, Order)
      .findOneOrFail({
        where: { code: order.code },
        relations: { lines: true, shippingLines: { shippingMethod: true } },
      });
    const handler = entity.shippingLines[0]!.shippingMethod!.fulfillmentHandlerCode;
    const fulfillment = await app.get(OrderService).createFulfillment(storeCtx, {
      lines: entity.lines.map((l) => ({ orderLineId: l.id, quantity: l.quantity })),
      handler: {
        code: handler,
        arguments:
          handler === "manual-fulfillment"
            ? [
                { name: "method", value: "Envío propio" },
                { name: "trackingCode", value: `PROPIO-${order.code.slice(0, 6)}` },
              ]
            : [],
      },
    });
    if (!("id" in fulfillment)) throw new Error(fulfillment.message);
    for (const kind of plan.events) {
      // Como el webhook: en una transacción (el stock se bloquea al cancelar).
      await app.get(TransactionalConnection).withTransaction(storeCtx, (tx) =>
        app.get(ShipmentEventsService).apply(tx, {
          provider: fulfillment.customFields.provider ?? "propio",
          eventId: randomUUID(),
          kind,
          status: { en_camino: "En camino", entregado: "Entregado", devuelto: "Devuelto" }[kind as string] ?? kind,
          fulfillmentId: fulfillment.id,
        }),
      );
    }
  }
  // Las comisiones se crean con eventos (asíncronos): se les da tiempo antes de cerrar.
  await new Promise((resolve) => setTimeout(resolve, 3000));
  console.log(`Cliente de prueba: ${CUSTOMER.email} / ${CUSTOMER.password} (${ORDERS.length} pedidos)`);
}
