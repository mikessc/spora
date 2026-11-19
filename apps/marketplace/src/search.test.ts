import { expect, test } from "vitest";
import { attributeGroups, meiliFilter, parseMarketQuery } from "./search";

test("lee la URL y descarta lo que no es un slug (los valores van a un filtro de Meilisearch)", () => {
  const q = parseMarketQuery(
    new URLSearchParams(
      'q=cafe&categoria=cafe-y-alimentos&categoria=x"] OR 1=1&marca=sibu&tienda=cafe-sur&moneda=USD&moneda=EUR&talla=M&color=Rojo&min=1000&max=abc&pagina=2',
    ),
  );
  expect(q).toEqual({
    q: "cafe",
    categories: ["cafe-y-alimentos"],
    brands: ["sibu"],
    stores: ["cafe-sur"],
    currencies: ["USD"],
    attributes: ["talla:m", "color:rojo"],
    min: 1000,
    max: null,
    page: 2,
  });
});

test("filtro: O dentro de cada grupo, Y entre grupos; precio en céntimos; una faceta puede excluirse a sí misma", () => {
  const q = parseMarketQuery(new URLSearchParams("talla=s&talla=m&color=negro&tienda=a&max=20000"));
  expect(meiliFilter(q)).toEqual([
    'storeToken IN ["a"]',
    'attributes IN ["talla:s", "talla:m"]',
    'attributes IN ["color:negro"]',
    "priceCrc <= 2000000",
  ]);
  expect(meiliFilter(q, "attributes:talla")).toEqual([
    'storeToken IN ["a"]',
    'attributes IN ["color:negro"]',
    "priceCrc <= 2000000",
  ]);
});

test("facetas de atributos → grupos del formulario, con etiquetas legibles", () => {
  expect(attributeGroups({ "talla:s": 2, "color:rojo": 1, "otro:x": 3 }, ["talla:s"])).toEqual([
    { name: "talla", label: "Talla", values: [{ value: "s", label: "S", count: 2, selected: true }] },
    { name: "color", label: "Color", values: [{ value: "rojo", label: "Rojo", count: 1, selected: false }] },
  ]);
});
