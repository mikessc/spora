import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import {
  contrastRatio,
  defaultPalette,
  designStyles,
  paletteFromColors,
  paletteFromPrimary,
  paletteRoles,
  paletteVariables,
  paletteWarnings,
  readableOn,
  suggestedPalettes,
  textTone,
  themeCss,
} from "./index";

const css = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");

test("cada estilo declarado tiene su archivo con las mismas variables", () => {
  const varsOf = (style: string) =>
    [...css(`./estilos/${style}.css`).matchAll(/(--sp-[a-z-]+):/g)].map((m) => m[1]).sort();
  const reference = varsOf("suave");
  for (const style of designStyles) expect(varsOf(style), style).toEqual(reference);
});

test("los 5 estilos usan los 5 roles: cada uno reparte primario, secundario y acento; fondo y texto, la página", () => {
  for (const style of designStyles) {
    const file = css(`./estilos/${style}.css`);
    for (const role of ["primary", "secondary", "accent"]) {
      expect(file, `${style} usa ${role}`).toMatch(new RegExp(`--sp-color-${role}\\b`));
    }
  }
  const page = css("../ui/styles.css").match(/body \{[^}]*\}/)?.[0] ?? "";
  expect(page).toContain("var(--sp-color-bg)");
  expect(page).toContain("var(--sp-color-fg)");
});

test("base.css trae por defecto exactamente las variables de la paleta de Spora", () => {
  const base = css("./base.css");
  for (const [name, value] of Object.entries(paletteVariables(defaultPalette))) {
    expect(base, name).toContain(`${name}: ${value};`);
  }
});

test("contraste WCAG: blanco sobre negro es 21; un color consigo mismo, 1", () => {
  expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 0);
  expect(contrastRatio("#1d6b4f", "#1d6b4f")).toBe(1);
});

test("texto legible encima de cada rol: siempre AA (4.5)", () => {
  for (const color of ["#1d6b4f", "#ffd84d", "#777777", "#f2a541", "#14171f", "#e8b230"]) {
    expect(contrastRatio(readableOn(color), color), color).toBeGreaterThanOrEqual(4.5);
  }
  // Prefiere los colores de la paleta si alcanzan.
  expect(readableOn("#ffd84d", defaultPalette)).toBe(defaultPalette.text);
});

test("un primario claro se oscurece para usarse como texto (enlaces y precio) sobre el fondo", () => {
  const tone = textTone("#f2b705", "#ffffff", "#1f1d1a");
  expect(tone).not.toBe("#f2b705");
  expect(contrastRatio(tone, "#ffffff")).toBeGreaterThanOrEqual(4.5);
});

test("las paletas sugeridas (6 a 8, por rubro) cumplen AA en todas sus combinaciones", () => {
  expect(suggestedPalettes.length).toBeGreaterThanOrEqual(6);
  expect(suggestedPalettes.length).toBeLessThanOrEqual(8);
  for (const { name, palette } of suggestedPalettes) expect(paletteWarnings(palette), name).toEqual([]);
  expect(paletteWarnings(defaultPalette)).toEqual([]);
});

test("avisos cuando una combinación no se lee", () => {
  const bad = { ...defaultPalette, text: "#d8d4cc", accent: "#f5f2ec" };
  const warnings = paletteWarnings(bad);
  expect(warnings).toContain("El texto casi no se lee sobre el fondo.");
  expect(warnings).toContain("El acento se confunde con el fondo: las ofertas no resaltan.");
});

test("paleta derivada de un primaryColor (migración): completa, legible y con el mismo primario", () => {
  for (const primary of ["#1d6b4f", "#6b4226", "#b5562f", "#2c2c2c", "#e0a500"]) {
    const palette = paletteFromPrimary(primary);
    expect(palette.primary).toBe(primary);
    expect(Object.keys(palette).sort()).toEqual([...paletteRoles].sort());
    expect(contrastRatio(palette.text, palette.background), primary).toBeGreaterThanOrEqual(7);
  }
  expect(paletteFromPrimary("rojo")).toEqual(defaultPalette);
});

test("paleta sugerida desde los colores de un logo: primario el más presente con color, acento de otro tono", () => {
  const palette = paletteFromColors(["#ffffff", "#111111", "#c8102e", "#d0142f", "#1e4fa1"]);
  expect(palette).toMatchObject({ primary: "#c8102e", accent: "#1e4fa1" });
  expect(paletteFromColors(["#ffffff", "#000000", "#808080"])).toBeNull();
});

test("themeCss: paleta completa o la de Spora; nunca deja pasar algo que no sea un color", () => {
  const ok = themeCss({ palette: suggestedPalettes[3]!.palette, font: "clasica" });
  expect(ok).toContain("--sp-color-primary: #2456d6");
  expect(ok).toContain("--sp-font: Georgia");
  const injected = themeCss({
    palette: { ...defaultPalette, primary: "red; } body { display:none" },
    font: "inventada",
  });
  expect(injected).not.toContain("display:none");
  expect(injected).toContain(`--sp-color-primary: ${defaultPalette.primary}`);
  expect(injected).not.toContain("--sp-font");
});
