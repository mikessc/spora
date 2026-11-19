import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createShopClient, type Product } from "@spora/api-client";
import { type DesignStyle, isDesignStyle } from "@spora/themes";
import { Hono } from "hono";
import { renderToStringAsync } from "sibujs/ssr";
import { ProductPage } from "./product-page";

const SHOP_API = process.env.VENDURE_SHOP_API ?? "http://localhost:3000/shop-api";
// ponytail: una sola tienda. En la Fase 1 el dominio del request decide el canal (y su estilo).
const STORE_TOKEN = process.env.STORE_TOKEN ?? "tienda-demo";
const PORT = Number(process.env.PORT ?? 4000);

const shop = createShopClient({ url: SHOP_API, channelToken: STORE_TOKEN });
const app = new Hono();

// Rutas relativas a apps/storefront (los scripts de pnpm corren ahí).
app.use("/static/*", serveStatic({ root: "./public", rewriteRequestPath: (p) => p.replace(/^\/static/, "") }));
app.use("/temas/*", serveStatic({ root: "../../packages/themes", rewriteRequestPath: (p) => p.replace(/^\/temas/, "") }));
app.use("/vendor/*", serveStatic({ root: "./node_modules/sibujs-ui/dist", rewriteRequestPath: (p) => p.replace(/^\/vendor/, "") }));

// Proxy a la Shop API: el navegador nunca habla directo con Vendure ni elige el canal.
app.post("/shop-api", async (c) => {
  const res = await fetch(SHOP_API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "vendure-token": STORE_TOKEN,
      cookie: c.req.header("cookie") ?? "",
    },
    body: await c.req.arrayBuffer(),
  });
  const headers = new Headers(res.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  return new Response(res.body, { status: res.status, headers });
});

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

function documentHtml(product: Product, style: DesignStyle, body: string) {
  return `<!doctype html>
<html lang="es-CR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(product.name)} · Tienda demo</title>
    <link rel="stylesheet" href="/vendor/sibujs-ui.css" />
    <link rel="stylesheet" href="/temas/base.css" />
    <link rel="stylesheet" href="/temas/estilos/${style}.css" />
    <link rel="stylesheet" href="/static/ficha.css" />
  </head>
  <body>
    ${body}
    <script src="/static/cliente.js" defer></script>
  </body>
</html>`;
}

app.get("/", (c) => c.redirect("/producto/camiseta-sibu"));

app.get("/producto/:slug", async (c) => {
  const product = await shop.product(c.req.param("slug"));
  if (!product) return c.text("Producto no encontrado", 404);
  const requested = c.req.query("estilo");
  const style: DesignStyle = isDesignStyle(requested) ? requested : "suave";
  const { html } = await renderToStringAsync(() => ProductPage(product));
  return c.html(documentHtml(product, style, html));
});

serve({ fetch: app.fetch, port: PORT }, ({ port }) => console.log(`Storefront en http://localhost:${port}`));
