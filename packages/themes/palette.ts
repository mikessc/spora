// Paleta de 5 colores por tienda (ADR 0005, correcciones post-MVP). El comercio elige 5 roles; de cada uno se derivan
// el hover, una superficie suave, el texto legible encima (WCAG AA) y un tono que se lee como texto sobre el fondo.

export const paletteRoles = ["primary", "secondary", "accent", "background", "text"] as const;
export type PaletteRole = (typeof paletteRoles)[number];
export type Palette = Record<PaletteRole, string>;

export const paletteLabels: Record<PaletteRole, { name: string; use: string }> = {
  primary: { name: "Primario", use: "botones de compra, enlaces y precio" },
  secondary: { name: "Secundario", use: "encabezado, pie y franjas" },
  accent: { name: "Acento", use: "ofertas e insignias" },
  background: { name: "Fondo", use: "fondo de la tienda" },
  text: { name: "Texto", use: "texto general" },
};

const HEX = /^#[0-9a-f]{6}$/i;
export const isHexColor = (value: unknown): value is string => typeof value === "string" && HEX.test(value);
export const isPalette = (value: unknown): value is Palette =>
  !!value && typeof value === "object" && paletteRoles.every((r) => isHexColor((value as Palette)[r]));

/** La paleta de Spora (verde brote): la de una tienda que no eligió la suya. */
export const defaultPalette: Palette = {
  primary: "#1d6b4f",
  secondary: "#173a2e",
  accent: "#d9a21b",
  background: "#faf8f5",
  text: "#1f1d1a",
};

// ── Color ──────────────────────────────────────────────────────────────────────────────────────────────────────────

type Rgb = [number, number, number];
const toRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const toHex = (rgb: Rgb) =>
  `#${rgb
    .map((c) =>
      Math.round(Math.min(255, Math.max(0, c)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

/** Mezcla `a` con `b` (t = 0 → a, t = 1 → b), en sRGB. */
export const mix = (a: string, b: string, t: number): string => {
  const [x, y] = [toRgb(a), toRgb(b)];
  return toHex(x.map((c, i) => c + (y[i]! - c) * t) as Rgb);
};

const luminance = (hex: string) => {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Contraste WCAG entre dos colores (1 a 21). AA pide 4.5 para texto normal y 3 para texto grande o íconos. */
export const contrastRatio = (a: string, b: string): number => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
};

const isDark = (hex: string) => luminance(hex) < 0.18;

function toHsl(hex: string): [number, number, number] {
  const [r, g, b] = toRgb(hex).map((c) => c / 255) as Rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

/** Texto legible sobre `bg`: el de la paleta si alcanza AA (4.5), si no blanco o casi negro, el que más contraste. */
export function readableOn(bg: string, palette: Pick<Palette, "text" | "background"> = defaultPalette): string {
  const own = [palette.text, palette.background]
    .filter((c) => contrastRatio(c, bg) >= 4.5)
    .sort((a, b) => contrastRatio(b, bg) - contrastRatio(a, bg));
  if (own[0]) return own[0];
  return contrastRatio("#ffffff", bg) >= contrastRatio("#000000", bg) ? "#ffffff" : "#000000";
}

/** Un tono de `color` que se lee como texto sobre `bg` (AA): se lo acerca al texto hasta que alcance. */
export function textTone(color: string, bg: string, text: string): string {
  for (let t = 0; t <= 1; t += 0.05) {
    const tone = mix(color, text, t);
    if (contrastRatio(tone, bg) >= 4.5) return tone;
  }
  return text;
}

// ── Paletas ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Una paleta completa a partir de un color de marca (la migración de las tiendas que solo tenían primaryColor). */
export function paletteFromPrimary(primary: string): Palette {
  if (!isHexColor(primary)) return defaultPalette;
  const [hue, saturation] = toHsl(primary);
  const background = mix("#fbfaf8", primary, 0.04);
  const text = mix("#1c1b19", primary, 0.12);
  // Acento: ámbar, salvo que la marca ya sea amarilla o naranja (entonces un turquesa).
  const accent = hue >= 25 && hue <= 75 && saturation > 0.3 ? "#1f8a8a" : "#d9a21b";
  return { primary, secondary: mix(primary, "#0b0a09", 0.45), accent, background, text };
}

/**
 * Paleta sugerida a partir de los colores de un logo, ya ordenados del más al menos presente (los extrae el panel con
 * un canvas). Usa el primero con color como primario y el siguiente con otro tono como acento.
 */
export function paletteFromColors(colors: string[]): Palette | null {
  const vivid = colors.filter(isHexColor).filter((c) => {
    const [, s, l] = toHsl(c);
    return s > 0.25 && l > 0.15 && l < 0.85;
  });
  const primary = vivid[0];
  if (!primary) return null;
  const base = paletteFromPrimary(primary);
  const [h] = toHsl(primary);
  const accent = vivid.find((c) => {
    const d = Math.abs(toHsl(c)[0] - h);
    return Math.min(d, 360 - d) > 40;
  });
  return accent ? { ...base, accent } : base;
}

/** 8 paletas listas, por rubro. Todas cumplen AA en sus combinaciones (lo verifica un test). */
export const suggestedPalettes: { name: string; category: string; palette: Palette }[] = [
  {
    name: "Algodón y bosque",
    category: "Moda",
    palette: { primary: "#1d6b4f", secondary: "#173a2e", accent: "#e07a5f", background: "#faf8f5", text: "#1f1d1a" },
  },
  {
    name: "Café de altura",
    category: "Café y alimentos",
    palette: { primary: "#7a4a2a", secondary: "#2e1d14", accent: "#c8a24a", background: "#f7f1ea", text: "#2a1f19" },
  },
  {
    name: "Barro y añil",
    category: "Artesanía",
    palette: { primary: "#a8481f", secondary: "#24346b", accent: "#e8b230", background: "#fbf5ec", text: "#2b211b" },
  },
  {
    name: "Circuito",
    category: "Tecnología",
    palette: { primary: "#2456d6", secondary: "#14171f", accent: "#18c29c", background: "#f6f7f9", text: "#14171f" },
  },
  {
    name: "Rosa té",
    category: "Belleza",
    palette: { primary: "#b03a62", secondary: "#4a2033", accent: "#d9a46b", background: "#fdf6f6", text: "#2d1b22" },
  },
  {
    name: "Huerta",
    category: "Hogar y plantas",
    palette: { primary: "#3d7a2a", secondary: "#2c3d24", accent: "#d67d2a", background: "#f8f7f0", text: "#1f2419" },
  },
  {
    name: "Recreo",
    category: "Niños y juguetes",
    palette: { primary: "#c2255c", secondary: "#2a5cc4", accent: "#f2b705", background: "#fffaf2", text: "#222033" },
  },
  {
    name: "Noche tropical",
    category: "Bebidas y fiesta",
    palette: { primary: "#f2a541", secondary: "#3b2a6b", accent: "#ff5d8f", background: "#151020", text: "#f4eefb" },
  },
];

/** Combinaciones de la paleta que no se leen bien (WCAG AA), en palabras del comercio. Vacío = todo bien. */
export function paletteWarnings(p: Palette): string[] {
  const warnings: string[] = [];
  const ratio = (a: string, b: string) => contrastRatio(a, b);
  if (ratio(p.text, p.background) < 4.5) warnings.push("El texto casi no se lee sobre el fondo.");
  if (ratio(p.primary, p.background) < 3)
    warnings.push("El primario se confunde con el fondo: los botones de compra no resaltan.");
  if (ratio(p.primary, p.background) < 4.5 && ratio(p.primary, p.background) >= 3)
    warnings.push("El primario no alcanza para texto sobre el fondo: enlaces y precios se oscurecen para que se lean.");
  if (ratio(p.secondary, p.background) < 1.5) warnings.push("El secundario casi no se distingue del fondo.");
  // El acento rellena insignias: lo que tiene que leerse es su texto encima (abajo), no el borde contra el fondo.
  if (ratio(p.accent, p.background) < 1.5)
    warnings.push("El acento se confunde con el fondo: las ofertas no resaltan.");
  for (const role of ["primary", "secondary", "accent"] as const) {
    if (ratio(readableOn(p[role], p), p[role]) < 4.5)
      warnings.push(`Ningún texto se lee bien sobre el ${paletteLabels[role].name.toLowerCase()}.`);
  }
  return warnings;
}

/** Las variables CSS de una paleta: los 5 roles y sus tonos derivados. */
export function paletteVariables(p: Palette): Record<string, string> {
  const bg = p.background;
  const surface = isDark(bg) ? mix(bg, "#ffffff", 0.06) : mix(bg, "#ffffff", 0.7);
  const vars: Record<string, string> = {
    "--sp-color-bg": bg,
    "--sp-color-surface": surface,
    "--sp-color-fg": p.text,
    "--sp-color-muted": textTone(mix(p.text, bg, 0.4), bg, p.text),
    "--sp-color-border": mix(bg, p.text, 0.14),
  };
  for (const role of ["primary", "secondary", "accent"] as const) {
    const color = p[role];
    vars[`--sp-color-${role}`] = color;
    vars[`--sp-color-${role}-fg`] = readableOn(color, p);
    vars[`--sp-color-${role}-hover`] = mix(color, isDark(color) ? "#ffffff" : "#000000", 0.14);
    vars[`--sp-color-${role}-soft`] = mix(bg, color, 0.12);
    vars[`--sp-color-${role}-text`] = textTone(color, bg, p.text);
  }
  return vars;
}
