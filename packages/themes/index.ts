// Tres capas independientes (ADR 0005): estilo (forma) × paleta (5 roles de color) × tipografía.
// Agregar un estilo = un archivo en estilos/ y su nombre aquí.
import { defaultPalette, isPalette, type Palette, paletteVariables } from "./palette";

export * from "./palette";

export const designStyles = ["suave", "minimal", "vibrante", "editorial", "pop"] as const;
export type DesignStyle = (typeof designStyles)[number];

export const isDesignStyle = (value: unknown): value is DesignStyle => designStyles.includes(value as DesignStyle);

/** Tipografías: pilas de fuentes del sistema (sin descargar fuentes). */
export const fonts = {
  sistema: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  clasica: 'Georgia, "Times New Roman", Cambria, serif',
  redondeada: 'ui-rounded, "Nunito", "Varela Round", "Segoe UI", system-ui, sans-serif',
  geometrica: '"Avenir Next", Avenir, Montserrat, "Century Gothic", "Segoe UI", sans-serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
} as const;
export type Font = keyof typeof fonts;

/**
 * Variables de la paleta y la tipografía de una tienda, listas para un `<style>`. Una paleta inválida (viene de la
 * base de datos o de un parámetro de vista previa: no se confía en ella dentro de CSS) usa la de Spora.
 */
export function themeCss({ palette, font }: { palette?: Partial<Palette> | null; font?: string | null }): string {
  const vars = Object.entries(paletteVariables(isPalette(palette) ? palette : defaultPalette)).map(
    ([name, value]) => `${name}: ${value}`,
  );
  if (font && font in fonts) vars.push(`--sp-font: ${fonts[font as Font]}`);
  return `:root { ${vars.join("; ")}; }`;
}
