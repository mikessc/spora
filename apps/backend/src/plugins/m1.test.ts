// Reglas de M1 contra un Vendure real (sql.js en memoria): alta de comercio, estados y catálogo.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LanguageCode, mergeConfig } from "@vendure/core";
import { createTestEnvironment, registerInitializer, SqljsInitializer, testConfig } from "@vendure/testing";
import gql from "graphql-tag";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { CatalogPlugin } from "./catalog/catalog.plugin";
import { SellersPlugin } from "./sellers/sellers.plugin";

const dir = path.dirname(fileURLToPath(import.meta.url));
registerInitializer("sqljs", new SqljsInitializer(path.join(dir, "../../__data__")));

const config = mergeConfig(testConfig, { plugins: [SellersPlugin, CatalogPlugin] });
const { server, adminClient } = createTestEnvironment(config);
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
