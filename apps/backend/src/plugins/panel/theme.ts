// Tema del Panel Spora para el Vendure Dashboard: colores de la marca Spora (verde brote) y la hoja de estilos con el
// logo. Lo usa vite.config.mts.
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

/** Verde Spora (#1d6b4f) y su texto encima. */
const brand = {
  primary: "oklch(0.47 0.09 162)",
  "primary-foreground": "oklch(0.98 0.01 162)",
  brand: "oklch(0.47 0.09 162)",
  "brand-foreground": "oklch(0.98 0.01 162)",
  ring: "oklch(0.47 0.09 162)",
  "sidebar-primary": "oklch(0.47 0.09 162)",
  "sidebar-primary-foreground": "oklch(0.98 0.01 162)",
};

export const sporaTheme = {
  light: brand,
  dark: { ...brand, primary: "oklch(0.7 0.11 162)", brand: "oklch(0.7 0.11 162)", ring: "oklch(0.7 0.11 162)" },
  additionalStylesheets: [path.join(dir, "dashboard/spora.css")],
};
