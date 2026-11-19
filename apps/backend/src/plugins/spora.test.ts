// Reglas de M1 contra un Vendure real (sql.js en memoria): alta de comercio, estados y catálogo.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LanguageCode, mergeConfig } from "@vendure/core";
import { businessDate } from "@spora/shared";
import { createTestEnvironment, registerInitializer, SqljsInitializer, testConfig } from "@vendure/testing";
import gql from "graphql-tag";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { AccountPlugin } from "./account/account.plugin";
import { CatalogPlugin } from "./catalog/catalog.plugin";
import { CurrencyPlugin } from "./currency/currency.plugin";
import { cashOnDeliveryHandler } from "./payments/cash-on-delivery";
import { SellersPlugin } from "./sellers/sellers.plugin";

const dir = path.dirname(fileURLToPath(import.meta.url));
registerInitializer("sqljs", new SqljsInitializer(path.join(dir, "../../__data__")));

process.env.BCCR_SIMULATED_RATE = "515.25";
const config = mergeConfig(testConfig, {
  plugins: [SellersPlugin, CatalogPlugin, CurrencyPlugin, AccountPlugin],
  paymentOptions: { paymentMethodHandlers: [cashOnDeliveryHandler] },
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
