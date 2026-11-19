import type { Variant } from "@spora/shared";
import { renderToStringAsync } from "sibujs/ssr";
import { expect, test } from "vitest";
import { otherPrice, VariantSelector } from "./variant-selector";

const variant = (id: string, optionIds: string[], stockLevel: Variant["stockLevel"] = "IN_STOCK"): Variant => ({
  id,
  sku: id,
  name: id,
  price: { amount: 1250000, currency: "CRC" },
  stockLevel,
  featuredAssetId: null,
  optionIds,
  otherCurrencyPrice: null,
});

const props = {
  optionGroups: [
    {
      id: "g1",
      name: "Talla",
      options: [
        { id: "s", name: "S" },
        { id: "m", name: "M" },
      ],
    },
    {
      id: "g2",
      name: "Color",
      options: [
        { id: "rojo", name: "Rojo" },
        { id: "azul", name: "Azul" },
      ],
    },
  ],
  variants: [variant("v1", ["s", "rojo"]), variant("v2", ["m", "azul"], "OUT_OF_STOCK")],
  initialVariantId: "v1",
};

test("el HTML del servidor trae marcadas las opciones de la variante inicial (bug de checked en SSR)", async () => {
  const { html } = await renderToStringAsync(() => VariantSelector(props));
  const checked = [...html.matchAll(/<input[^>]*value="([^"]+)"[^>]*>/g)]
    .filter(([tag]) => /\schecked(=|\s|\/|>)/.test(tag))
    .map(([, value]) => value);
  expect(checked).toEqual(["s", "rojo"]);
  expect(html).toContain("₡12");
  expect(html).toContain("Disponible");
});

test("precio en la otra moneda: el manual del comercio gana a la conversión", () => {
  const v = variant("v1", ["s"]);
  expect(otherPrice(v, "500")).toEqual({ amount: 2500, currency: "USD" });
  expect(otherPrice({ ...v, otherCurrencyPrice: 2400 }, "500")).toEqual({ amount: 2400, currency: "USD" });
  expect(otherPrice(v, null)).toBeNull();
});
