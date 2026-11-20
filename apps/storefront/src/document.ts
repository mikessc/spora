// El documento HTML alrededor de cada página: estilos de la tienda, SEO y el script de las islas.
import type { Store } from "@spora/api-client";
import type { PageMeta } from "@spora/web";
import { type DesignStyle, fonts, isDesignStyle, isPalette, paletteRoles, themeCss } from "@spora/themes";

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
/** JSON dentro de `<script>`: sin `<` no hay forma de cerrar la etiqueta ni abrir un comentario. */
const scriptJson = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");

/** Estilo de la tienda; `?estilo=` lo sobreescribe para previsualizar. */
export function styleFor(store: Store, requested?: string): DesignStyle {
  if (isDesignStyle(requested)) return requested;
  return isDesignStyle(store.designStyle) ? store.designStyle : "suave";
}

/**
 * Vista previa de "Mi tienda" en el Panel Spora: `?paleta=` (5 colores sin #, separados por guiones, en el orden de
 * los roles) y `?fuente=` cambian solo esta respuesta. Lo inválido se ignora (themeCss valida igual).
 */
export function previewStore(store: Store, query: { paleta?: string; fuente?: string }): Store {
  const colors = query.paleta?.split("-").map((c) => `#${c}`);
  const palette = colors && Object.fromEntries(paletteRoles.map((role, i) => [role, colors[i]]));
  return {
    ...store,
    palette: isPalette(palette) ? palette : store.palette,
    font: query.fuente && query.fuente in fonts ? query.fuente : store.font,
  };
}

export function documentHtml(store: Store, style: DesignStyle, meta: PageMeta, body: string) {
  const description = meta.description?.slice(0, 160);
  const css = themeCss({ palette: store.palette, font: store.font });
  return `<!doctype html>
<html lang="es-CR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(meta.title)}</title>
    ${description ? `<meta name="description" content="${escapeHtml(description)}" />` : ""}
    ${meta.noindex ? `<meta name="robots" content="noindex" />` : ""}
    <link rel="canonical" href="${escapeHtml(meta.canonical)}" />
    <meta property="og:title" content="${escapeHtml(meta.title)}" />
    <meta property="og:site_name" content="${escapeHtml(store.name)}" />
    <meta property="og:url" content="${escapeHtml(meta.canonical)}" />
    ${description ? `<meta property="og:description" content="${escapeHtml(description)}" />` : ""}
    <link rel="stylesheet" href="/vendor/sibujs-ui.css" />
    <link rel="stylesheet" href="/temas/base.css" />
    <link rel="stylesheet" href="/temas/estilos/${style}.css" />
    ${css ? `<style>${css}</style>` : ""}
    <link rel="stylesheet" href="/ui/styles.css" />
    <link rel="stylesheet" href="/ui/store.css" />
    ${meta.jsonLd ? `<script type="application/ld+json">${scriptJson(meta.jsonLd)}</script>` : ""}
  </head>
  <body>
    ${body}
    <script src="/static/cliente.js" defer></script>
  </body>
</html>`;
}

export function sitemapXml(urls: string[]) {
  const entries = urls.map((url) => `  <url><loc>${escapeHtml(url)}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>`;
}
