import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createShopClient, ShopApiError, type ShopClient, type Store } from "@spora/api-client";
import { parseCatalogQuery } from "@spora/shared";
import { Hono } from "hono";
import { renderToStringAsync } from "sibujs/ssr";
import { registerAccountRoutes } from "./account";
import { registerCheckoutRoutes } from "./checkout";
import type { Ctx, Env, Page } from "./context";
import { documentHtml, sitemapXml, styleFor } from "./document";
import { type PolicyPage, policyPages, Shell } from "./layout";
import { CartPage, Listing, notFound, PolicyPageView, StoreIntro } from "./pages";
import { ProductPage, productJsonLd } from "./product-page";
import { shareSessionCookie } from "./session-cookie";
import { storeSlugFromHost } from "./store-host";

const SHOP_API = process.env.VENDURE_SHOP_API ?? "http://localhost:3000/shop-api";
/** Dominio bajo el que viven las tiendas: `<tienda>.spora.localhost` en local, `<tienda>.spora.cr` en línea. */
const BASE_DOMAIN = process.env.STORE_BASE_DOMAIN ?? "spora.localhost";
const PORT = Number(process.env.PORT ?? 4000);

const app = new Hono<Env>();

// Rutas relativas a apps/storefront (los scripts de pnpm corren ahí).
const files = (prefix: string, root: string) =>
  serveStatic({ root, rewriteRequestPath: (p) => p.slice(prefix.length) });
app.use("/static/*", files("/static", "./public"));
app.use("/ui/*", files("/ui", "../../packages/ui"));
app.use("/temas/*", files("/temas", "../../packages/themes"));
app.use("/vendor/*", files("/vendor", "./node_modules/sibujs-ui/dist"));

const plainPage = (title: string, text: string) =>
  `<!doctype html><html lang="es-CR"><head><meta charset="utf-8" /><title>${title}</title></head>` +
  `<body><main><h1>${title}</h1><p>${text}</p></main></body></html>`;

// El dominio del request decide la tienda (PLAN §2, multi-tenant). El token del canal es el subdominio.
app.use("*", async (c, next) => {
  const slug = storeSlugFromHost(c.req.header("host") ?? "", BASE_DOMAIN);
  if (!slug) {
    return c.html(plainPage("Tienda no encontrada", `Las tiendas viven en &lt;tienda&gt;.${BASE_DOMAIN}.`), 404);
  }
  const setCookies: string[] = [];
  c.set("slug", slug);
  c.set("setCookies", setCookies);
  c.set(
    "shop",
    createShopClient({
      url: SHOP_API,
      channelToken: slug,
      cookie: c.req.header("cookie"),
      onSetCookie: (cookies) => setCookies.push(...cookies),
    }),
  );
  await next();
  // La sesión (carrito y Cuenta Spora) la crea Vendure: sus cookies pasan al navegador, compartidas entre tiendas.
  for (const cookie of setCookies) c.header("set-cookie", shareSessionCookie(cookie, BASE_DOMAIN), { append: true });
});

// Proxy a la Shop API para las islas: el navegador nunca habla directo con Vendure ni elige el canal.
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
  headers.delete("set-cookie");
  for (const cookie of res.headers.getSetCookie())
    headers.append("set-cookie", shareSessionCookie(cookie, BASE_DOMAIN));
  return new Response(res.body, { status: res.status, headers });
});

/** La tienda activa, o `null` si no existe o su comercio no está activo. */
async function loadStore(shop: ShopClient): Promise<Store | null> {
  try {
    return await shop.store();
  } catch (err) {
    if (err instanceof ShopApiError && (err.code === "STORE_NOT_ACTIVE" || err.code === "CHANNEL_NOT_FOUND")) {
      return null;
    }
    throw err;
  }
}

/** Arma una página de la tienda: datos del armazón en paralelo, SSR y documento con estilo y SEO. */
async function render(c: Ctx, page: Page) {
  const shop = c.get("shop");
  const store = await loadStore(shop);
  if (!store) {
    return c.html(plainPage("Tienda no disponible", "Esta tienda no existe o todavía no está publicada."), 404);
  }
  // La página va primero: puede cambiar el carrito o la sesión (formularios), y el armazón debe mostrarlo ya.
  const result = await page(store);
  if (result instanceof Response) return result;
  const [collections, cart, customer] = await Promise.all([shop.collections(), shop.activeOrder(), shop.customer()]);
  const url = new URL(c.req.url);
  const { html } = await renderToStringAsync(() =>
    Shell(
      {
        store,
        collections,
        customer,
        cartCount: cart?.totalQuantity ?? 0,
        query: url.searchParams.get("q") ?? "",
      },
      result.content(),
    ),
  );
  const canonical = `${url.origin}${url.pathname}`;
  return c.html(
    documentHtml(store, styleFor(store, c.req.query("estilo")), { ...result.meta, canonical }, html),
    (result.status ?? 200) as 200,
  );
}

app.get("/", (c) =>
  render(c, async (store) => {
    const products = await c.get("shop").catalog();
    return {
      content: () =>
        Listing({
          title: "Productos",
          products,
          query: parseCatalogQuery(new URL(c.req.url).searchParams),
          action: "/",
          intro: StoreIntro(store),
        }),
      meta: { title: store.tagline ? `${store.name} · ${store.tagline}` : store.name, description: store.about },
    };
  }),
);

app.get("/categoria/:slug", (c) =>
  render(c, async (store) => {
    const shop = c.get("shop");
    const slug = c.req.param("slug");
    const [collections, products] = await Promise.all([shop.collections(), shop.catalog()]);
    const collection = collections.find((col) => col.slug === slug);
    if (!collection) return notFound("Esta categoría no existe en la tienda.");
    return {
      content: () =>
        Listing({
          title: collection.name,
          products: products.filter((p) => p.collectionSlugs.includes(slug)),
          query: parseCatalogQuery(new URL(c.req.url).searchParams),
          action: `/categoria/${slug}`,
        }),
      meta: { title: `${collection.name} · ${store.name}`, description: store.tagline },
    };
  }),
);

app.get("/buscar", (c) =>
  render(c, async (store) => {
    const query = parseCatalogQuery(new URL(c.req.url).searchParams);
    const products = await c.get("shop").catalog();
    return {
      content: () =>
        Listing({
          title: query.q ? `Resultados para “${query.q}”` : "Buscar",
          products,
          query,
          action: "/buscar",
        }),
      meta: { title: `Buscar · ${store.name}`, noindex: true },
    };
  }),
);

app.get("/producto/:slug", (c) =>
  render(c, async (store) => {
    const shop = c.get("shop");
    const [product, brands, rate] = await Promise.all([
      shop.product(c.req.param("slug")),
      shop.brandNames(),
      shop.exchangeRate(),
    ]);
    if (!product) return notFound("Puede que este producto ya no esté a la venta.");
    const url = new URL(c.req.url);
    return {
      content: () => ProductPage(product, rate.rate),
      meta: {
        title: `${product.name} · ${store.name}`,
        description: product.descriptionHtml
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim(),
        jsonLd: productJsonLd(product, store, `${url.origin}${url.pathname}`, brands.get(product.brand ?? "")),
      },
    };
  }),
);

/** Avisos del carrito: la URL solo lleva un código, nunca texto (así nadie arma mensajes falsos con un enlace). */
const NOTICES: Record<string, string> = {
  "sin-stock": "Esa combinación no está disponible. Elija otra talla o color.",
  error: "No se pudo actualizar el carrito. Intente de nuevo.",
};

app.get("/carrito", (c) =>
  render(c, async (store) => {
    const cart = await c.get("shop").activeOrder();
    return {
      content: () => CartPage(cart, NOTICES[c.req.query("aviso") ?? ""]),
      meta: { title: `Carrito · ${store.name}`, noindex: true },
    };
  }),
);

// Agregar sin JS: el formulario de la ficha trae el producto y la opción elegida de cada grupo.
app.post("/carrito/agregar", async (c) => {
  const form = await c.req.formData();
  const shop = c.get("shop");
  const product = await shop.product(String(form.get("producto") ?? ""));
  const chosen = product?.optionGroups.map((g) => String(form.get(`opcion-${g.id}`) ?? "")) ?? [];
  const variant = product?.variants.find((v) => chosen.every((id) => v.optionIds.includes(id)));
  if (!variant || variant.stockLevel === "OUT_OF_STOCK") return c.redirect("/carrito?aviso=sin-stock", 303);
  try {
    await shop.addItemToOrder(variant.id, 1);
    return c.redirect("/carrito", 303);
  } catch {
    return c.redirect("/carrito?aviso=error", 303);
  }
});

app.post("/carrito/linea", async (c) => {
  const form = await c.req.formData();
  const shop = c.get("shop");
  const lineId = String(form.get("linea") ?? "");
  const quantity = form.get("quitar") ? 0 : Math.max(0, Math.min(99, Math.trunc(Number(form.get("cantidad")))));
  try {
    if (!quantity || Number.isNaN(quantity)) await shop.removeOrderLine(lineId);
    else await shop.adjustOrderLine(lineId, quantity);
    return c.redirect("/carrito", 303);
  } catch {
    return c.redirect("/carrito?aviso=error", 303);
  }
});

app.get("/politicas/:page", (c) =>
  render(c, async (store) => {
    const page = c.req.param("page") as PolicyPage;
    if (!(page in policyPages) || !store.policies[page]) return notFound("Esta tienda no publicó esa política.");
    return {
      content: () => PolicyPageView(store, page),
      meta: { title: `${policyPages[page]} · ${store.name}` },
    };
  }),
);

app.get("/robots.txt", (c) => c.text(`User-agent: *\nAllow: /\nSitemap: ${new URL(c.req.url).origin}/sitemap.xml\n`));

app.get("/sitemap.xml", async (c) => {
  const shop = c.get("shop");
  const store = await loadStore(shop);
  if (!store) return c.text("", 404);
  const origin = new URL(c.req.url).origin;
  const [collections, products] = await Promise.all([shop.collections(), shop.catalog()]);
  const policies = (Object.keys(policyPages) as PolicyPage[]).filter((key) => store.policies[key]);
  const urls = [
    `${origin}/`,
    ...collections.map((col) => `${origin}/categoria/${col.slug}`),
    ...products.map((p) => `${origin}/producto/${p.slug}`),
    ...policies.map((key) => `${origin}/politicas/${key}`),
  ];
  return c.body(sitemapXml(urls), 200, { "content-type": "application/xml; charset=utf-8" });
});

registerAccountRoutes(app, render, BASE_DOMAIN);
registerCheckoutRoutes(app, render);

serve({ fetch: app.fetch, port: PORT }, ({ port }) =>
  console.log(`Storefront en http://<tienda>.${BASE_DOMAIN}:${port}`),
);
