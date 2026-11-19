import type { Variant } from "@spora/api-client";
import { renderToStringAsync } from "sibujs/ssr";
import { expect, test } from "vitest";
import { VariantSelector } from "./variant-selector";

const variant = (id: string, optionIds: string[], stockLevel: Variant["stockLevel"] = "IN_STOCK"): Variant => ({
  id,
  sku: id,
  name: id,
  price: { amount: 1250000, currency: "CRC" },
  stockLevel,
  featuredAssetId: null,
  optionIds,
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
