import assert from "node:assert/strict";
import { test } from "node:test";
import type { Store } from "@spora/api-client";
import type { CatalogProduct } from "@spora/shared";
import { categoryPaths, toMarketplaceDocuments } from "./documents";

const store = { token: "cafe-sur", name: "Café Sur", tagline: null, logo: null, currency: "USD" } as Store;
const product = (over: Partial<CatalogProduct>): CatalogProduct => ({
  id: "1",
  name: "Café",
  slug: "cafe",
  description: "",
  image: null,
  brand: "cafe-sur",
  category: "cafe-y-alimentos-cafe",
  collectionSlugs: [],
  priceFrom: { amount: 1250, currency: "USD" },
  available: true,
  attributes: { tamano: [{ value: "340-g", label: "340 g" }] },
  ...over,
});
const paths = categoryPaths([
  { slug: "cafe-y-alimentos", parentSlug: null },
  { slug: "cafe-y-alimentos-cafe", parentSlug: "cafe-y-alimentos" },
]);

test("documento del marketplace: categoría con ancestras, atributos, precio en colones y solo marcas aprobadas", () => {
  const { products, store: doc } = toMarketplaceDocuments(
    store,
    [product({}), product({ id: "2", slug: "otro", brand: "propuesta-x" }), product({ id: "3", category: null })],
    { paths, brandNames: new Map([["cafe-sur", "Café Sur"]]), rate: "515.00" },
  );
  assert.equal(products.length, 2, "sin categoría global no se indexa");
  assert.deepEqual(products[0], {
    id: "cafe-sur-1",
    slug: "cafe",
    name: "Café",
    description: "",
    image: null,
    storeToken: "cafe-sur",
    storeName: "Café Sur",
    brand: "cafe-sur",
    brandName: "Café Sur",
    categories: ["cafe-y-alimentos", "cafe-y-alimentos-cafe"],
    attributes: ["tamano:340-g"],
    attributeLabels: { "tamano:340-g": "340 g" },
    price: { amount: 1250, currency: "USD" },
    priceCrc: 643750,
    currency: "USD",
    available: true,
  });
  assert.equal(products[1]?.brand, null, "una marca propuesta no se muestra");
  assert.deepEqual(doc, {
    id: "cafe-sur",
    name: "Café Sur",
    tagline: null,
    logo: null,
    currency: "USD",
    productCount: 2,
    categories: ["cafe-y-alimentos"],
  });
});
