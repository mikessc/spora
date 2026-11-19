import { expect, test } from "vitest";
import type { CatalogProduct } from "./catalog";
import { facets, filterCatalog, parseCatalogQuery } from "./catalog-query";

const product = (slug: string, attributes: CatalogProduct["attributes"], description = ""): CatalogProduct => ({
  id: slug,
  name: slug.replace(/-/g, " "),
  slug,
  description,
  image: null,
  brand: null,
  category: null,
  collectionSlugs: [],
  priceFrom: null,
  available: true,
  attributes,
});
const v = (label: string) => ({ value: label.toLowerCase(), label });

const catalog = [
  product("camiseta-sibu", { talla: [v("S"), v("M")], color: [v("Rojo"), v("Azul")] }, "Algodón peinado"),
  product("camiseta-volcan", { talla: [v("S")], color: [v("Negro")] }, "Estampado del Arenal"),
  product("gorra-sibu", { color: [v("Rojo"), v("Negro")] }),
];
const slugs = (list: CatalogProduct[]) => list.map((p) => p.slug);

test("lee la URL: atributos conocidos normalizados, el resto se ignora", () => {
  const query = parseCatalogQuery(new URLSearchParams("color=Rojo&color=negro&talla=s&precio=1&q=  gorra "));
  expect(query).toEqual({ q: "gorra", attributes: { color: ["rojo", "negro"], talla: ["s"] } });
});

test("valores de un atributo con O, atributos distintos con Y", () => {
  const rojoONegro = parseCatalogQuery(new URLSearchParams("color=rojo&color=negro"));
  expect(slugs(filterCatalog(catalog, rojoONegro))).toEqual(["camiseta-sibu", "camiseta-volcan", "gorra-sibu"]);
  const tallaSyNegro = parseCatalogQuery(new URLSearchParams("talla=s&color=negro"));
  expect(slugs(filterCatalog(catalog, tallaSyNegro))).toEqual(["camiseta-volcan"]);
});

test("la búsqueda ignora tildes y mayúsculas y exige todas las palabras", () => {
  expect(slugs(filterCatalog(catalog, parseCatalogQuery(new URLSearchParams("q=ALGODON camiseta"))))).toEqual([
    "camiseta-sibu",
  ]);
  expect(filterCatalog(catalog, parseCatalogQuery(new URLSearchParams("q=arenal gorra")))).toEqual([]);
});

test("las facetas cuentan sin su propia selección y marcan lo elegido", () => {
  const color = facets(catalog, parseCatalogQuery(new URLSearchParams("color=rojo&talla=s"))).find(
    (f) => f.attribute === "color",
  );
  // Con talla S quedan las dos camisetas: el conteo de color no se reduce por elegir rojo.
  expect(color?.values).toEqual([
    { value: "rojo", label: "Rojo", count: 1, selected: true },
    { value: "azul", label: "Azul", count: 1, selected: false },
    { value: "negro", label: "Negro", count: 1, selected: false },
  ]);
});
