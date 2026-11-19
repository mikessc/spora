// Reglas de M1 contra un Vendure real (sql.js en memoria): alta de comercio, estados y catálogo.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LanguageCode, mergeConfig, TransactionalConnection } from "@vendure/core";
import { businessDate } from "@spora/shared";
import { createTestEnvironment, registerInitializer, SqljsInitializer, testConfig } from "@vendure/testing";
import gql from "graphql-tag";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { AccountPlugin } from "./account/account.plugin";
import { CatalogPlugin } from "./catalog/catalog.plugin";
import { CommissionsPlugin } from "./commissions/commissions.plugin";
import { MarketplacePlugin } from "./marketplace/marketplace.plugin";
import { CurrencyPlugin } from "./currency/currency.plugin";
import { sign } from "./payments/gateways";
import { PaymentsPlugin } from "./payments/payments.plugin";
import { SellersPlugin } from "./sellers/sellers.plugin";
import { ShippingPlugin, signTrackingAppWebhook } from "./shipping/shipping.plugin";

const dir = path.dirname(fileURLToPath(import.meta.url));
registerInitializer("sqljs", new SqljsInitializer(path.join(dir, "../../__data__")));

process.env.BCCR_SIMULATED_RATE = "515.25";
process.env.MEILI_HOST = ""; // sin Meilisearch en las pruebas: el índice se apaga
const config = mergeConfig(testConfig, {
  plugins: [
    SellersPlugin,
    CatalogPlugin,
    CurrencyPlugin,
    AccountPlugin,
    PaymentsPlugin,
    ShippingPlugin,
    CommissionsPlugin,
    MarketplacePlugin,
  ],
  paymentOptions: { paymentMethodHandlers: [] },
  authOptions: { requireVerification: false },
});
const { server, adminClient, shopClient } = createTestEnvironment(config);
const shopUrl = `http://localhost:${config.apiOptions.port}/${config.apiOptions.shopApiPath}`;

const REGISTER = gql`
  mutation ($input: RegisterStoreInput!) {
    registerStore(input: $input) {
      id
      token
      defaultCurrencyCode
      seller {
        id
      }
      customFields {
        storeName
        designStyle
      }
    }
  }
`;
const CREATE_CATEGORY = gql`
  mutation ($name: String!, $parentId: ID) {
    createMarketplaceCategory(input: { name: $name, parentId: $parentId }) {
      id
      slug
    }
  }
`;
const CREATE_PRODUCT = gql`
  mutation ($enabled: Boolean!, $slug: String!, $category: String, $brand: String) {
    createProduct(
      input: {
        enabled: $enabled
        translations: [{ languageCode: es, name: $slug, slug: $slug, description: "" }]
        customFields: { marketplaceCategory: $category, brand: $brand }
      }
    ) {
      id
      enabled
      customFields {
        marketplaceCategory
        brand
      }
    }
  }
`;
const UPDATE_PRODUCT = gql`
  mutation ($id: ID!, $enabled: Boolean!) {
    updateProduct(input: { id: $id, enabled: $enabled }) {
      enabled
    }
  }
`;
const PRODUCT = gql`
  query ($id: ID!) {
    product(id: $id) {
      customFields {
        brand
      }
    }
  }
`;
const PROPOSE = gql`
  mutation ($name: String!) {
    proposeBrand(name: $name) {
      id
      slug
      status
    }
  }
`;
const MERGE = gql`
  mutation ($sourceId: ID!, $targetId: ID!) {
    mergeBrands(sourceId: $sourceId, targetId: $targetId) {
      id
      slug
      status
    }
  }
`;
const BRANDS = gql`
  query {
    brands {
      slug
      status
      mergedIntoId
    }
  }
`;

const shopStatus = async (token: string) => {
  const res = await fetch(shopUrl, {
    method: "POST",
    headers: { "content-type": "application/json", "vendure-token": token },
    body: JSON.stringify({ query: "{ activeChannel { code } }" }),
  });
  return res.status;
};

const admin = { firstName: "Ana", lastName: "Mora", emailAddress: "ana@cafe-sur.cr", password: "clave-segura" };

before(async () => {
  await server.init({
    initialData: {
      defaultLanguage: LanguageCode.es,
      defaultZone: "Costa Rica",
      countries: [{ name: "Costa Rica", code: "CR", zone: "Costa Rica" }],
      taxRates: [{ name: "IVA", percentage: 13 }],
      shippingMethods: [],
      paymentMethods: [],
      collections: [],
    },
  });
  await adminClient.asSuperAdmin();
  await adminClient.query(gql`
    mutation {
      updateGlobalSettings(input: { availableLanguages: [es, en] }) {
        __typename
      }
    }
  `);
});

after(() => server.destroy());

describe("alta de comercio", () => {
  let store: { id: string; token: string; defaultCurrencyCode: string; seller: { id: string } };

  test("crea canal en su moneda base, con estilo y nombre de tienda", async () => {
    const { registerStore } = await adminClient.query(REGISTER, {
      input: { name: "Café Sur", slug: "cafe-sur", baseCurrency: "USD", administrator: admin },
    });
    store = registerStore;
    assert.partialDeepStrictEqual(registerStore, {
      token: "cafe-sur",
      defaultCurrencyCode: "USD",
      customFields: { storeName: "Café Sur", designStyle: "suave" },
    });
  });

  test("el canal nuevo tiene su propia ubicación de stock", async () => {
    adminClient.setChannelToken(store.token);
    const { stockLocations } = await adminClient.query(gql`
      query {
        stockLocations {
          items {
            name
          }
        }
      }
    `);
    adminClient.setChannelToken(testConfig.defaultChannelToken ?? "e2e-default-channel");
    assert.ok(stockLocations.items.some((l: { name: string }) => l.name === "Bodega · Café Sur"));
  });

  test("rechaza subdominios reservados o inválidos", async () => {
    for (const slug of ["admin", "a", "Con Espacios"]) {
      await assert.rejects(
        adminClient.query(REGISTER, {
          input: { name: "X", slug, baseCurrency: "CRC", administrator: { ...admin, emailAddress: `${slug}@x.cr` } },
        }),
        /subdominio/,
      );
    }
  });

  test("el administrador del comercio entra y solo ve su canal", async () => {
    await adminClient.asUserWithCredentials(admin.emailAddress, admin.password);
    const { activeAdministrator } = await adminClient.query(gql`
      query {
        activeAdministrator {
          user {
            roles {
              channels {
                code
              }
            }
          }
        }
      }
    `);
    await adminClient.asSuperAdmin();
    const codes = activeAdministrator.user.roles.flatMap((r: { channels: { code: string }[] }) =>
      r.channels.map((c) => c.code),
    );
    assert.deepEqual(codes, ["cafe-sur"]);
  });

  test("solo un comercio activo publica: pendiente y suspendido dan 403", async () => {
    assert.equal(await shopStatus("cafe-sur"), 403);
    const setStatus = (status: string) =>
      adminClient.query(
        gql`
          mutation ($id: ID!, $status: String!) {
            updateSeller(input: { id: $id, customFields: { status: $status } }) {
              id
            }
          }
        `,
        { id: store.seller.id, status },
      );
    await setStatus("activo");
    assert.equal(await shopStatus("cafe-sur"), 200);
    await setStatus("suspendido");
    assert.equal(await shopStatus("cafe-sur"), 403);
  });
});

describe("tema de la tienda (M2)", () => {
  const UPDATE_THEME = gql`
    mutation ($id: ID!, $style: String, $color: String) {
      updateChannel(input: { id: $id, customFields: { designStyle: $style, primaryColor: $color } }) {
        __typename
        ... on Channel {
          customFields {
            designStyle
            primaryColor
          }
        }
      }
    }
  `;
  const CHANNEL_IDS = gql`
    query {
      channels {
        items {
          id
          code
        }
      }
    }
  `;

  test("el comercio cambia estilo y color de su tienda, pero no los de otro canal", async () => {
    const { channels } = await adminClient.query(CHANNEL_IDS);
    const own = channels.items.find((c: { code: string }) => c.code === "cafe-sur");
    const other = channels.items.find((c: { code: string }) => c.code !== "cafe-sur");

    await adminClient.asUserWithCredentials(admin.emailAddress, admin.password);
    adminClient.setChannelToken("cafe-sur");
    try {
      const { updateChannel } = await adminClient.query(UPDATE_THEME, { id: own.id, style: "pop", color: "#c8102e" });
      assert.deepEqual(updateChannel.customFields, { designStyle: "pop", primaryColor: "#c8102e" });
      await assert.rejects(
        adminClient.query(UPDATE_THEME, { id: own.id, color: "rojo; }" }),
        /primaryColor|patr|pattern/i,
      );
      await assert.rejects(adminClient.query(UPDATE_THEME, { id: other.id, style: "pop" }), /not currently authorized/);
    } finally {
      adminClient.setChannelToken(testConfig.defaultChannelToken ?? "e2e-default-channel");
      await adminClient.asSuperAdmin();
    }
  });
});

describe("catálogo", () => {
  test("las categorías hijas llevan el camino en el slug", async () => {
    const moda = (await adminClient.query(CREATE_CATEGORY, { name: "Moda" })).createMarketplaceCategory;
    const mujer = (await adminClient.query(CREATE_CATEGORY, { name: "Mujer", parentId: moda.id }))
      .createMarketplaceCategory;
    assert.deepEqual([moda.slug, mujer.slug], ["moda", "moda-mujer"]);
  });

  test("sin categoría global no se publica", async () => {
    await assert.rejects(
      adminClient.query(CREATE_PRODUCT, { enabled: true, slug: "sin-categoria" }),
      /categoría global/,
    );
    const borrador = (await adminClient.query(CREATE_PRODUCT, { enabled: false, slug: "borrador" })).createProduct;
    await assert.rejects(adminClient.query(UPDATE_PRODUCT, { id: borrador.id, enabled: true }), /categoría global/);
    await assert.rejects(
      adminClient.query(CREATE_PRODUCT, { enabled: true, slug: "categoria-falsa", category: "no-existe" }),
      /no existe/,
    );
    // Un borrador con categoría sí se publica después (regresión: el update no traía los custom fields).
    const conCategoria = (
      await adminClient.query(CREATE_PRODUCT, { enabled: false, slug: "borrador-con-categoria", category: "moda" })
    ).createProduct;
    assert.equal(
      (await adminClient.query(UPDATE_PRODUCT, { id: conCategoria.id, enabled: true })).updateProduct.enabled,
      true,
    );
    assert.equal(
      (await adminClient.query(UPDATE_PRODUCT, { id: conCategoria.id, enabled: false })).updateProduct.enabled,
      false,
    );
    const ok = (await adminClient.query(CREATE_PRODUCT, { enabled: true, slug: "vestido", category: "moda-mujer" }))
      .createProduct;
    assert.partialDeepStrictEqual(ok, { enabled: true, customFields: { marketplaceCategory: "moda-mujer" } });
  });

  test("proponer una marca existente no la duplica", async () => {
    const a = (await adminClient.query(PROPOSE, { name: "Café Britt" })).proposeBrand;
    const b = (await adminClient.query(PROPOSE, { name: "  cafe britt " })).proposeBrand;
    assert.equal(b.id, a.id);
    assert.partialDeepStrictEqual(a, { slug: "cafe-britt", status: "propuesta" });
  });

  test("fusionar marcas pasa los productos a la marca destino", async () => {
    const target = (await adminClient.query(PROPOSE, { name: "Café Britt" })).proposeBrand;
    const source = (await adminClient.query(PROPOSE, { name: "Britt" })).proposeBrand;
    const product = (
      await adminClient.query(CREATE_PRODUCT, { enabled: true, slug: "cafe-molido", category: "moda", brand: "britt" })
    ).createProduct;

    const merged = (await adminClient.query(MERGE, { sourceId: source.id, targetId: target.id })).mergeBrands;
    assert.partialDeepStrictEqual(merged, { slug: "cafe-britt", status: "aprobada" });

    const after = (await adminClient.query(PRODUCT, { id: product.id })).product;
    assert.equal(after.customFields.brand, "cafe-britt");
    const { brands } = await adminClient.query(BRANDS);
    assert.ok(
      brands.some(
        (b: unknown) =>
          JSON.stringify(b) === JSON.stringify({ slug: "britt", status: "fusionada", mergedIntoId: target.id }),
      ),
    );
    // Quien vuelva a proponer la marca fusionada recibe la vigente, y la vieja ya no se puede asignar.
    assert.equal((await adminClient.query(PROPOSE, { name: "Britt" })).proposeBrand.id, target.id);
    await assert.rejects(
      adminClient.query(CREATE_PRODUCT, { enabled: false, slug: "otro", category: "moda", brand: "britt" }),
      /fusionó/,
    );
  });
});

describe("cuenta y checkout (M3)", () => {
  const DEFAULT_TOKEN = testConfig.defaultChannelToken ?? "e2e-default-channel";
  const ORDER = `code state currencyCode totalWithTax customFields { exchangeRate exchangeRateDate }`;
  const RESULT = `__typename ... on Order { ${ORDER} } ... on ErrorResult { errorCode message }`;
  const customer = { emailAddress: "rosa@correo.cr", firstName: "Rosa", lastName: "Vargas", password: "clave-segura" };

  before(async () => {
    // Café Sur (USD) quedó suspendida en las pruebas de alta: se activa y se le crea un producto con stock.
    await adminClient.asSuperAdmin();
    const { channels } = await adminClient.query(gql`
      query {
        channels {
          items {
            code
            seller {
              id
            }
          }
        }
      }
    `);
    const cafe = channels.items.find((c: { code: string }) => c.code === "cafe-sur");
    await adminClient.query(
      gql`
        mutation ($id: ID!) {
          updateSeller(input: { id: $id, customFields: { status: "activo" } }) {
            id
          }
        }
      `,
      { id: cafe.seller.id },
    );
    adminClient.setChannelToken("cafe-sur");
    const { createProduct } = await adminClient.query(CREATE_PRODUCT, {
      enabled: true,
      slug: "cafe-500",
      category: "moda",
    });
    await adminClient.query(
      gql`
        mutation ($productId: ID!) {
          createProductVariants(
            input: [
              {
                productId: $productId
                sku: "CAF-500"
                price: 1000
                stockOnHand: 20
                translations: [{ languageCode: es, name: "Café 500 g" }]
              }
            ]
          ) {
            id
          }
        }
      `,
      { productId: createProduct.id },
    );
    adminClient.setChannelToken(DEFAULT_TOKEN);
  });

  test("una tienda nueva vende desde el primer día: envío propio, retiro y contra entrega", async () => {
    shopClient.setChannelToken("cafe-sur");
    const { product } = await shopClient.query(gql`
      query {
        product(slug: "cafe-500") {
          variants {
            id
          }
        }
      }
    `);
    await shopClient.query(
      gql`mutation ($id: ID!) { addItemToOrder(productVariantId: $id, quantity: 2) { ${RESULT} } }`,
      { id: product.variants[0].id },
    );
    const { eligibleShippingMethods, eligiblePaymentMethods } = await shopClient.query(gql`
      query {
        eligibleShippingMethods {
          name
          priceWithTax
        }
        eligiblePaymentMethods {
          code
          isEligible
        }
      }
    `);
    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
    assert.deepEqual(eligibleShippingMethods.sort(byName), [
      { name: "Envío a domicilio", priceWithTax: 500 },
      { name: "Retiro en local", priceWithTax: 0 },
    ]);
    assert.deepEqual(eligiblePaymentMethods, [{ code: "cafe-sur-contra-entrega", isEligible: true }]);
  });

  test("una sola cuenta: se registra en el marketplace y Café Sur la reconoce sin registrarse de nuevo", async () => {
    shopClient.setChannelToken(DEFAULT_TOKEN);
    await shopClient.query(
      gql`
        mutation ($input: RegisterCustomerInput!) {
          registerCustomerAccount(input: $input) {
            __typename
          }
        }
      `,
      { input: customer },
    );
    shopClient.setChannelToken("cafe-sur");
    await shopClient.asUserWithCredentials(customer.emailAddress, customer.password);
    const { activeCustomer } = await shopClient.query(gql`
      query {
        activeCustomer {
          emailAddress
        }
      }
    `);
    assert.equal(activeCustomer?.emailAddress, customer.emailAddress);
  });

  test("el pedido guarda moneda, monto y el tipo de cambio del día al pasar a pago", async () => {
    shopClient.setChannelToken("cafe-sur");
    const { product } = await shopClient.query(gql`
      query {
        product(slug: "cafe-500") {
          variants {
            id
          }
        }
      }
    `);
    await shopClient.query(
      gql`mutation ($id: ID!) { addItemToOrder(productVariantId: $id, quantity: 1) { ${RESULT} } }`,
      { id: product.variants[0].id },
    );
    await shopClient.query(
      gql`mutation ($input: CreateAddressInput!) { setOrderShippingAddress(input: $input) { ${RESULT} } }`,
      {
        input: {
          fullName: "Rosa Vargas",
          streetLine1: "Frente a la plaza",
          city: "Escazú",
          province: "San José",
          postalCode: "10201",
          countryCode: "CR",
          customFields: { district: "Escazú", districtCode: "10201" },
        },
      },
    );
    const { eligibleShippingMethods } = await shopClient.query(gql`
      query {
        eligibleShippingMethods {
          id
          name
        }
      }
    `);
    const delivery = eligibleShippingMethods.find((m: { name: string }) => m.name === "Envío a domicilio");
    await shopClient.query(
      gql`mutation ($id: [ID!]!) { setOrderShippingMethod(shippingMethodId: $id) { ${RESULT} } }`,
      {
        id: [delivery.id],
      },
    );
    const { transitionOrderToState: order } = await shopClient.query(
      gql`mutation { transitionOrderToState(state: "ArrangingPayment") { ${RESULT} } }`,
    );
    assert.equal(order.currencyCode, "USD");
    assert.equal(order.customFields.exchangeRate, "515.25");
    assert.equal(order.customFields.exchangeRateDate, businessDate());
    const { addPaymentToOrder: paid } = await shopClient.query(
      gql`mutation { addPaymentToOrder(input: { method: "cafe-sur-contra-entrega", metadata: {} }) { ${RESULT} } }`,
    );
    assert.equal(paid.state, "PaymentAuthorized");
    // 1 × $10 + $5 de envío (el cliente de pruebas abre una sesión nueva al ingresar: no trae el carrito anónimo).
    assert.equal(paid.totalWithTax, 1500);
  });

  test("el historial de la Cuenta Spora junta los pedidos de todas las tiendas", async () => {
    shopClient.setChannelToken(DEFAULT_TOKEN);
    const { sporaOrders } = await shopClient.query(gql`
      query {
        sporaOrders {
          storeToken
          storeName
          currencyCode
          total
          exchangeRate
          state
        }
      }
    `);
    assert.deepEqual(sporaOrders, [
      {
        storeToken: "cafe-sur",
        storeName: "Café Sur",
        currencyCode: "USD",
        total: 1500,
        exchangeRate: "515.25",
        state: "PaymentAuthorized",
      },
    ]);
  });
});

describe("pagos (M4)", () => {
  const DEFAULT_TOKEN = testConfig.defaultChannelToken ?? "e2e-default-channel";
  const ORDER = `code state totalWithTax payments { id state method metadata }`;
  const RESULT = `__typename ... on Order { ${ORDER} } ... on ErrorResult { errorCode message }`;
  const returnUrl = "http://cafe-sur.spora.localhost:4000/pago/retorno?pedido=X";

  const createMethod = (handler: string, args: Record<string, string>) =>
    adminClient.query(
      gql`
        mutation ($input: CreatePaymentMethodInput!) {
          createPaymentMethod(input: $input) {
            id
            handler {
              args {
                name
                value
              }
            }
          }
        }
      `,
      {
        input: {
          code: `cafe-sur-${handler}`,
          enabled: true,
          handler: { code: handler, arguments: Object.entries(args).map(([name, value]) => ({ name, value })) },
          translations: [{ languageCode: "es", name: handler }],
        },
      },
    );

  /** Un pedido de Café Sur (USD) listo para pagar: 1 × $10 + $5 de envío. */
  async function orderReadyToPay() {
    shopClient.setChannelToken("cafe-sur");
    const { product } = await shopClient.query(gql`
      query {
        product(slug: "cafe-500") {
          variants {
            id
          }
        }
      }
    `);
    await shopClient.query(
      gql`mutation ($id: ID!) { addItemToOrder(productVariantId: $id, quantity: 1) { ${RESULT} } }`,
      { id: product.variants[0].id },
    );
    await shopClient.query(
      gql`mutation ($input: CreateAddressInput!) { setOrderShippingAddress(input: $input) { ${RESULT} } }`,
      {
        input: {
          fullName: "Rosa Vargas",
          streetLine1: "Frente a la plaza",
          city: "Escazú",
          province: "San José",
          postalCode: "10201",
          countryCode: "CR",
        },
      },
    );
    const { eligibleShippingMethods } = await shopClient.query(gql`
      query {
        eligibleShippingMethods {
          id
          name
        }
      }
    `);
    const delivery = eligibleShippingMethods.find((m: { name: string }) => m.name === "Envío a domicilio");
    await shopClient.query(
      gql`mutation ($id: [ID!]!) { setOrderShippingMethod(shippingMethodId: $id) { ${RESULT} } }`,
      {
        id: [delivery.id],
      },
    );
    await shopClient.query(gql`mutation { transitionOrderToState(state: "ArrangingPayment") { ${RESULT} } }`);
  }

  const pay = async (method: string, metadata: Record<string, string> = {}) =>
    (
      await shopClient.query(gql`mutation ($input: PaymentInput!) { addPaymentToOrder(input: $input) { ${RESULT} } }`, {
        input: { method, metadata },
      })
    ).addPaymentToOrder;

  const complete = async (code: string, params: Record<string, string>) =>
    (
      await shopClient.query(
        gql`mutation ($code: String!, $params: JSON!) { completeExternalPayment(orderCode: $code, params: $params) { ${ORDER} } }`,
        { code, params },
      )
    ).completeExternalPayment;

  before(async () => {
    await adminClient.asSuperAdmin();
    adminClient.setChannelToken("cafe-sur");
    await createMethod("sinpe-movil", { telefono: "8999-1234", titular: "Café Sur" });
    await createMethod("paypal", { clientId: "id", clientSecret: "secreto-paypal", entorno: "sandbox" });
    adminClient.setChannelToken(DEFAULT_TOKEN);
  });

  test("las credenciales del comercio quedan cifradas en la base y en claro para el Admin", async () => {
    const rows: { handler: string }[] = await server.app
      .get(TransactionalConnection)
      .rawConnection.query(
        `select handler from payment_method where code in ('cafe-sur-sinpe-movil', 'cafe-sur-paypal')`,
      );
    const raw = rows.map((r) => r.handler).join(" ");
    assert.ok(!raw.includes("8999-1234") && !raw.includes("secreto-paypal"), raw);
    assert.match(raw, /enc:v1:/);
    adminClient.setChannelToken("cafe-sur");
    const { paymentMethods } = await adminClient.query(gql`
      query {
        paymentMethods {
          items {
            code
            handler {
              args {
                name
                value
              }
            }
          }
        }
      }
    `);
    adminClient.setChannelToken(DEFAULT_TOKEN);
    const sinpe = paymentMethods.items.find((m: { code: string }) => m.code === "cafe-sur-sinpe-movil");
    assert.deepEqual(sinpe.handler.args[0], { name: "telefono", value: "8999-1234" });
  });

  test("SINPE en una tienda en USD cobra en colones con el tipo de cambio del pedido", async () => {
    await orderReadyToPay();
    const order = await pay("cafe-sur-sinpe-movil");
    assert.equal(order.state, "PaymentAuthorized");
    // $15 × ₡515,25 = ₡7 728,75
    const lines = order.payments.at(-1).metadata.public.lineas.join(" ").replace(/\s/g, " ");
    assert.match(lines, /₡7 728,75 al 8999-1234 \(Café Sur\)/);
  });

  test("PayPal: espera a la pasarela; un retorno falso rechaza y uno firmado liquida, una sola vez", async () => {
    await orderReadyToPay();
    await assert.rejects(pay("cafe-sur-paypal", { returnUrl: "https://evil.example/robar" }), /no permitida/);
    const first = await pay("cafe-sur-paypal", { returnUrl });
    assert.equal(first.state, "ArrangingPayment");
    assert.equal(first.payments.at(-1).state, "EnPasarela");
    const url = new URL(first.payments.at(-1).metadata.public.url);
    assert.equal(url.searchParams.get("monto"), "$15");

    const forged = await complete(first.code, { ref: url.searchParams.get("ref")!, estado: "aprobado", firma: "x" });
    assert.equal(forged.state, "ArrangingPayment");
    assert.equal(forged.payments.at(-1).state, "Declined");

    const second = await pay("cafe-sur-paypal", { returnUrl });
    const ref = new URL(second.payments.at(-1).metadata.public.url).searchParams.get("ref")!;
    const approved = { ref, estado: "aprobado", firma: sign(`${ref}|aprobado`) };
    const settled = await complete(second.code, approved);
    assert.equal(settled.state, "PaymentSettled");
    const again = await complete(second.code, approved);
    assert.equal(again.state, "PaymentSettled");
    assert.equal(again.payments.filter((p: { state: string }) => p.state === "Settled").length, 1);
  });
});

describe("envíos (M5)", () => {
  const DEFAULT_TOKEN = testConfig.defaultChannelToken ?? "e2e-default-channel";
  const RESULT = `__typename ... on Order { code state } ... on ErrorResult { errorCode message }`;
  const webhookUrl = `http://localhost:${config.apiOptions.port}/webhooks/trackingapp`;
  let fulfillment: { id: string; customFields: { externalId: string } };
  let orderId: string;

  const postWebhook = (token: string, payload: object, eventId: string, secret = "whsec_cafe") => {
    const body = JSON.stringify(payload);
    return fetch(`${webhookUrl}/${token}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tracking-signature": signTrackingAppWebhook(body, secret),
        "x-tracking-event": (payload as { type: string }).type,
        "x-tracking-event-id": eventId,
      },
      body,
    });
  };
  const delivered = () => ({
    id: "evento-1",
    type: "package.delivered",
    data: { package: { id: fulfillment.customFields.externalId, trackingNumber: "x", status: "entregado" } },
  });

  before(async () => {
    // Café Sur con TrackingApp: secreto del webhook y un método de envío que crea la guía allá.
    await adminClient.asSuperAdmin();
    adminClient.setChannelToken("cafe-sur");
    const { activeChannel } = await adminClient.query(gql`
      query {
        activeChannel {
          id
        }
      }
    `);
    await adminClient.query(
      gql`
        mutation ($id: ID!) {
          updateChannel(input: { id: $id, customFields: { trackingAppWebhookSecret: "whsec_cafe" } }) {
            __typename
          }
        }
      `,
      { id: activeChannel.id },
    );
    await adminClient.query(gql`
      mutation {
        createShippingMethod(
          input: {
            code: "cafe-sur-mensajeria"
            fulfillmentHandler: "trackingapp"
            checker: { code: "default-shipping-eligibility-checker", arguments: [{ name: "orderMinimum", value: "0" }] }
            calculator: {
              code: "default-shipping-calculator"
              arguments: [
                { name: "rate", value: "400" }
                { name: "includesTax", value: "include" }
                { name: "taxRate", value: "0" }
              ]
            }
            translations: [{ languageCode: es, name: "Mensajería", description: "" }]
          }
        ) {
          id
        }
      }
    `);

    ({ orderId, fulfillment } = await placeCodOrder());
    adminClient.setChannelToken(DEFAULT_TOKEN);
  });

  /** Un pedido de Café Sur con contra entrega, enviado por TrackingApp (simulado). El adminClient va en cafe-sur. */
  const placeCodOrder = async () => {
    shopClient.setChannelToken("cafe-sur");
    const { product } = await shopClient.query(gql`
      query {
        product(slug: "cafe-500") {
          variants {
            id
          }
        }
      }
    `);
    await shopClient.query(
      gql`mutation ($id: ID!) { addItemToOrder(productVariantId: $id, quantity: 1) { ${RESULT} } }`,
      { id: product.variants[0].id },
    );
    await shopClient.query(
      gql`mutation ($input: CreateAddressInput!) { setOrderShippingAddress(input: $input) { ${RESULT} } }`,
      {
        input: {
          fullName: "Rosa",
          streetLine1: "Casa 1",
          city: "Escazú",
          province: "San José",
          postalCode: "10201",
          countryCode: "CR",
        },
      },
    );
    const { eligibleShippingMethods } = await shopClient.query(gql`
      query {
        eligibleShippingMethods {
          id
          name
        }
      }
    `);
    const courier = eligibleShippingMethods.find((m: { name: string }) => m.name === "Mensajería");
    await shopClient.query(
      gql`mutation ($id: [ID!]!) { setOrderShippingMethod(shippingMethodId: $id) { ${RESULT} } }`,
      {
        id: [courier.id],
      },
    );
    await shopClient.query(gql`mutation { transitionOrderToState(state: "ArrangingPayment") { ${RESULT} } }`);
    const { addPaymentToOrder: order } = await shopClient.query(
      gql`mutation { addPaymentToOrder(input: { method: "cafe-sur-contra-entrega", metadata: {} }) { ${RESULT} } }`,
    );
    const { orders } = await adminClient.query(
      gql`
        query ($code: String!) {
          orders(options: { filter: { code: { eq: $code } } }) {
            items {
              id
              lines {
                id
                quantity
              }
            }
          }
        }
      `,
      { code: order.code },
    );
    const { addFulfillmentToOrder } = await adminClient.query(
      gql`
        mutation ($input: FulfillOrderInput!) {
          addFulfillmentToOrder(input: $input) {
            ... on Fulfillment {
              id
              customFields {
                externalId
              }
            }
            ... on ErrorResult {
              message
            }
          }
        }
      `,
      {
        input: {
          lines: orders.items[0].lines.map((l: { id: string; quantity: number }) => ({
            orderLineId: l.id,
            quantity: l.quantity,
          })),
          handler: { code: "trackingapp", arguments: [] },
        },
      },
    );
    return { orderId: orders.items[0].id as string, fulfillment: addFulfillmentToOrder as typeof fulfillment };
  };
  const orderStatus = async (id: string) => {
    adminClient.setChannelToken("cafe-sur");
    const { order } = await adminClient.query(
      gql`
        query ($id: ID!) {
          order(id: $id) {
            state
            payments {
              state
            }
            fulfillments {
              state
              customFields {
                trackingStatus
              }
            }
          }
        }
      `,
      { id },
    );
    adminClient.setChannelToken(DEFAULT_TOKEN);
    return order;
  };

  test("webhook firmado: entrega el pedido y liquida la contra entrega; repetido no hace nada", async () => {
    assert.ok(fulfillment.customFields.externalId, JSON.stringify(fulfillment));
    const first = await postWebhook("cafe-sur", delivered(), "evento-1");
    assert.equal(first.status, 200);
    assert.equal(((await first.json()) as { result: string }).result, "aplicado");
    const again = await postWebhook("cafe-sur", delivered(), "evento-1");
    assert.equal(((await again.json()) as { result: string }).result, "repetido");
    assert.deepEqual(await orderStatus(orderId), {
      state: "Delivered",
      payments: [{ state: "Settled" }],
      fulfillments: [{ state: "Delivered", customFields: { trackingStatus: "Entregado" } }],
    });
  });

  // Encontrado por el seed (M7): Vendure no cancela un pedido con líneas vivas; hay que usar cancelOrder.
  test("devuelto tras salir: cancela el pedido, la guía y la contra entrega sin cobrar", async () => {
    adminClient.setChannelToken("cafe-sur");
    const returned = await placeCodOrder();
    adminClient.setChannelToken(DEFAULT_TOKEN);
    const pkg = { id: returned.fulfillment.customFields.externalId, trackingNumber: "x" };
    const onTheWay = { id: "evento-4", type: "package.status_changed", data: { to: "en_transito", package: pkg } };
    assert.equal((await postWebhook("cafe-sur", onTheWay, "evento-4")).status, 200);
    const back = { id: "evento-5", type: "package.returned", data: { package: { ...pkg, status: "devuelto" } } };
    const res = await postWebhook("cafe-sur", back, "evento-5");
    assert.equal(res.status, 200, await res.clone().text());
    assert.deepEqual(await orderStatus(returned.orderId), {
      state: "Cancelled",
      payments: [{ state: "Cancelled" }],
      fulfillments: [{ state: "Cancelled", customFields: { trackingStatus: "Devuelto" } }],
    });
  });

  test("webhook con firma falsa → 401; de una tienda sin TrackingApp → 404", async () => {
    assert.equal((await postWebhook("cafe-sur", delivered(), "evento-2", "whsec_falso")).status, 401);
    assert.equal((await postWebhook(DEFAULT_TOKEN, delivered(), "evento-3")).status, 404);
  });
});

describe("comisiones (M6)", () => {
  const DEFAULT_TOKEN = testConfig.defaultChannelToken ?? "e2e-default-channel";
  const month = businessDate().slice(0, 7);
  const STATEMENT = gql`
    query ($month: String!, $sellerId: ID) {
      commissionStatement(month: $month, sellerId: $sellerId) {
        totals {
          currency
          pendiente
          facturable
          facturado
        }
        entries {
          orderCode
          status
          currency
          baseAmount
          percentage
          amount
          billingMonth
        }
      }
    }
  `;
  let cafeSeller: string;

  /** Los movimientos se crean con eventos de Vendure (asíncronos): se espera a que aparezcan. */
  async function statementWhen(ready: (s: { entries: { status: string }[] }) => boolean) {
    for (let i = 0; i < 50; i++) {
      const { commissionStatement } = await adminClient.query(STATEMENT, { month, sellerId: cafeSeller });
      if (ready(commissionStatement)) return commissionStatement;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Los movimientos de comisión no llegaron");
  }

  before(async () => {
    await adminClient.asSuperAdmin();
    const { channels } = await adminClient.query(gql`
      query {
        channels {
          items {
            code
            seller {
              id
            }
          }
        }
      }
    `);
    cafeSeller = channels.items.find((c: { code: string }) => c.code === "cafe-sur").seller.id;
  });

  test("cada pedido de Café Sur tiene su movimiento; el entregado es facturable este mes con copia del porcentaje", async () => {
    const statement = await statementWhen((s) => s.entries.some((e) => e.status === "facturable"));
    const billable = statement.entries.filter((e: { status: string }) => e.status === "facturable");
    assert.equal(billable.length, 1);
    // $10 de producto (sin envío) al 5 % por defecto = $0,50.
    assert.deepEqual(billable[0], {
      ...billable[0],
      currency: "USD",
      baseAmount: 1000,
      percentage: "5",
      amount: 50,
      billingMonth: month,
    });
    assert.ok(statement.entries.some((e: { status: string }) => e.status === "pendiente"));
  });

  test("el comercio ve solo su estado de cuenta; el admin de Spora cierra el mes", async () => {
    await adminClient.asUserWithCredentials(admin.emailAddress, admin.password);
    adminClient.setChannelToken("cafe-sur");
    try {
      const { commissionStatement } = await adminClient.query(STATEMENT, { month });
      assert.ok(commissionStatement.entries.length > 0);
      await assert.rejects(adminClient.query(STATEMENT, { month, sellerId: "1" }), /not currently authorized/);
      await assert.rejects(
        adminClient.query(
          gql`
            mutation ($m: String!) {
              closeCommissionMonth(month: $m) {
                id
              }
            }
          `,
          { m: month },
        ),
        /not currently authorized/,
      );
    } finally {
      adminClient.setChannelToken(DEFAULT_TOKEN);
      await adminClient.asSuperAdmin();
    }
    const { closeCommissionMonth } = await adminClient.query(
      gql`
        mutation ($m: String!) {
          closeCommissionMonth(month: $m) {
            sellerId
            currency
            total
            entryCount
          }
        }
      `,
      { m: month },
    );
    assert.deepEqual(closeCommissionMonth, [{ sellerId: cafeSeller, currency: "USD", total: 50, entryCount: 1 }]);
    const after = await statementWhen(() => true);
    assert.deepEqual(after.totals[0].facturado, 50);
    assert.deepEqual(after.totals[0].facturable, 0);
  });
});
