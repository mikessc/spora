import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createShopClient, ShopApiError, type ShopClient, type Store } from "@spora/api-client";
import { type DesignStyle, isDesignStyle } from "@spora/themes";
import { Hono } from "hono";
import { renderToStringAsync } from "sibujs/ssr";
import { ProductPage } from "./product-page";
import { storeSlugFromHost } from "./store-host";

const SHOP_API = process.env.VENDURE_SHOP_API ?? "http://localhost:3000/shop-api";
/** Dominio bajo el que viven las tiendas: `<tienda>.spora.localhost` en local, `<tienda>.spora.cr` en línea. */
const BASE_DOMAIN = process.env.STORE_BASE_DOMAIN ?? "spora.localhost";
const PORT = Number(process.env.PORT ?? 4000);

type Env = { Variables: { slug: string; shop: ShopClient } };
const app = new Hono<Env>();

// Rutas relativas a apps/storefront (los scripts de pnpm corren ahí).
const files = (prefix: string, root: string) =>
  serveStatic({ root, rewriteRequestPath: (p) => p.slice(prefix.length) });
app.use("/static/*", files("/static", "./public"));
app.use("/ui/*", files("/ui", "../../packages/ui"));
app.use("/temas/*", files("/temas", "../../packages/themes"));
app.use("/vendor/*", files("/vendor", "./node_modules/sibujs-ui/dist"));

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

const notFound = (title: string, text: string) =>
  `<!doctype html><html lang="es-CR"><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title></head>` +
  `<body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(text)}</p></main></body></html>`;

// El dominio del request decide la tienda (PLAN §2, multi-tenant). El token del canal es el subdominio.
app.use("*", async (c, next) => {
  const slug = storeSlugFromHost(c.req.header("host") ?? "", BASE_DOMAIN);
  if (!slug) return c.html(notFound("Tienda no encontrada", `Las tiendas viven en <tienda>.${BASE_DOMAIN}.`), 404);
  c.set("slug", slug);
  c.set("shop", createShopClient({ url: SHOP_API, channelToken: slug }));
  await next();
});

// Proxy a la Shop API: el navegador nunca habla directo con Vendure ni elige el canal (lo fija el dominio).
app.post("/shop-api", async (c) => {
  const res = await fetch(SHOP_API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "vendure-token": c.get("slug"),
      cookie: c.req.header("cookie") ?? "",
    },
    body: await c.req.arrayBuffer(),
  });
  const headers = new Headers(res.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  return new Response(res.body, { status: res.status, headers });
});

function documentHtml(title: string, style: DesignStyle, body: string) {
  return `<!doctype html>
<html lang="es-CR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="/vendor/sibujs-ui.css" />
    <link rel="stylesheet" href="/temas/base.css" />
    <link rel="stylesheet" href="/temas/estilos/${style}.css" />
    <link rel="stylesheet" href="/ui/styles.css" />
  </head>
  <body>
    ${body}
    <script src="/static/cliente.js" defer></script>
  </body>
</html>`;
}

/** La tienda activa, o `null` si no existe o su comercio no está activo. */
async function loadStore(shop: ShopClient): Promise<Store | null> {
  try {
    return await shop.store();
  } catch (err) {
    if (err instanceof ShopApiError && (err.code === "STORE_NOT_ACTIVE" || err.code === "CHANNEL_NOT_FOUND"))
      return null;
    throw err;
  }
}

app.get("/producto/:slug", async (c) => {
  const shop = c.get("shop");
  const store = await loadStore(shop);
  if (!store)
    return c.html(notFound("Tienda no disponible", "Esta tienda no existe o todavía no está publicada."), 404);
  const product = await shop.product(c.req.param("slug"));
  if (!product) return c.html(notFound("Producto no encontrado", "Puede que ya no esté a la venta."), 404);
  // `?estilo=` permite previsualizar otro estilo sin cambiar la tienda.
  const requested = c.req.query("estilo");
  const style: DesignStyle = isDesignStyle(requested)
    ? requested
    : isDesignStyle(store.designStyle)
      ? store.designStyle
      : "suave";
  const { html } = await renderToStringAsync(() => ProductPage(product));
  return c.html(documentHtml(`${product.name} · ${store.name}`, style, html));
});

serve({ fetch: app.fetch, port: PORT }, ({ port }) =>
  console.log(`Storefront en http://<tienda>.${BASE_DOMAIN}:${port}`),
);
