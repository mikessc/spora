import type { Store } from "@spora/api-client";
import { defaultPalette, suggestedPalettes } from "@spora/themes";
import { expect, test } from "vitest";
import { previewStore } from "./document";

const store = { palette: null, font: "sistema" } as unknown as Store;

test("vista previa de Mi tienda: ?paleta= y ?fuente= cambian solo esta respuesta", () => {
  const { palette } = suggestedPalettes[3]!;
  const paleta = [palette.primary, palette.secondary, palette.accent, palette.background, palette.text]
    .map((c) => c.slice(1))
    .join("-");
  expect(previewStore(store, { paleta, fuente: "clasica" })).toMatchObject({ palette, font: "clasica" });
});

test("vista previa: lo inválido se ignora (no entra nada que no sea un color o una fuente conocida)", () => {
  const saved = { ...store, palette: defaultPalette };
  for (const paleta of ["red;}body{display:none", "123456-abcdef", "zzzzzz-zzzzzz-zzzzzz-zzzzzz-zzzzzz"]) {
    expect(previewStore(saved, { paleta, fuente: "inventada" })).toMatchObject({
      palette: defaultPalette,
      font: "sistema",
    });
  }
});
