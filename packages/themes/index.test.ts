import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { contrastText, designStyles, themeCss } from "./index";

test("cada estilo declarado tiene su archivo con las mismas variables", () => {
  const varsOf = (style: string) =>
    [...readFileSync(new URL(`./estilos/${style}.css`, import.meta.url), "utf8").matchAll(/(--sp-[a-z-]+):/g)]
      .map((m) => m[1])
      .sort();
  const reference = varsOf("suave");
  for (const style of designStyles) expect(varsOf(style), style).toEqual(reference);
});

test("texto legible según el color de marca", () => {
  expect(contrastText("#1d6b4f")).toBe("#ffffff");
  expect(contrastText("#ffd84d")).toBe("#1f1d1a");
});

test("themeCss ignora valores que no son un color o una fuente conocida", () => {
  expect(themeCss({ primaryColor: "#c8102e", font: "clasica" })).toContain("--sp-color-primary: #c8102e");
  expect(themeCss({ primaryColor: "red; } body { display:none", font: "inventada" })).toBe("");
});
