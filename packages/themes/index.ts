// Tres capas independientes (ADR 0005): estilo (forma) × paleta (color de marca) × tipografía.
// Agregar un estilo = un archivo en estilos/ y su nombre aquí.

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

const HEX = /^#[0-9a-f]{6}$/i;

/** Texto legible sobre `hex`: blanco u oscuro según la luminancia (WCAG). */
export function contrastText(hex: string): "#ffffff" | "#1f1d1a" {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Contraste contra blanco vs. contra #1f1d1a (luminancia ≈ 0.013): gana el mayor.
  return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.063 ? "#ffffff" : "#1f1d1a";
}

/**
 * Variables de la paleta y la tipografía de una tienda, listas para un `<style>`. Ignora valores inválidos (vienen de
 * la base de datos, no se confía en ellos dentro de CSS).
 */
export function themeCss({ primaryColor, font }: { primaryColor?: string | null; font?: string | null }): string {
  const vars: string[] = [];
  if (primaryColor && HEX.test(primaryColor)) {
    vars.push(`--sp-color-primary: ${primaryColor}`, `--sp-color-primary-fg: ${contrastText(primaryColor)}`);
  }
  if (font && font in fonts) vars.push(`--sp-font: ${fonts[font as Font]}`);
  return vars.length ? `:root { ${vars.join("; ")}; }` : "";
}
