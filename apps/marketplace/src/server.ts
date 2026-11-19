// Marketplace (spora.cr; en local spora.localhost:5000): directorio de todas las tiendas. No vende: cada producto
// lleva a su tienda. Lee el índice global de Meilisearch y la Shop API del canal del marketplace (cuenta).
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createShopClient, type Store } from "@spora/api-client";
import { type MarketplaceProduct, type MarketplaceStore, PRODUCTS_INDEX, STORES_INDEX } from "@spora/shared";
import type { FilterGroup } from "@spora/ui";
import { type Ctx, type Env, type Page, registerAccountRoutes, shareSessionCookie } from "@spora/web";
import { Hono } from "hono";
import { MeiliSearch } from "meilisearch";
import { renderToStringAsync } from "sibujs/ssr";
import { attributeGroups, type MarketQuery, meiliFilter, parseMarketQuery } from "./search";
import { type Category, HomePage, SearchPage, Shell, StoresPage } from "./pages";

const SHOP_API = process.env.VENDURE_SHOP_API ?? "http://localhost:3000/shop-api";
const BASE_DOMAIN = process.env.STORE_BASE_DOMAIN ?? "spora.localhost";
/** URL de una tienda: `{tienda}` es su subdominio. En línea, `https://{tienda}.spora.cr`. */
const STORE_URL = process.env.STORE_URL ?? "http://{tienda}.spora.localhost:4000";
const PORT = Number(process.env.PORT ?? 5000);
const PAGE_SIZE = 24;

const meili = new MeiliSearch({
  host: process.env.MEILI_HOST ?? "http://localhost:7700",
  apiKey: process.env.MEILI_SEARCH_KEY ?? process.env.MEILI_MASTER_KEY ?? "solo-desarrollo-meili",
});
const storeUrl = (token: string) => STORE_URL.replace("{tienda}", token);
const productUrl = (p: MarketplaceProduct) => `${storeUrl(p.storeToken)}/producto/${p.slug}`;

/** El marketplace no es una tienda; las piezas compartidas (cuenta) esperan una: esta es la de Spora. */
const SPORA: Store = {
  token: "",
  name: "Spora",
  currency: "CRC",
  designStyle: "suave",
  primaryColor: null,
  font: "sistema",
  logo: null,
  tagline: "Tiendas de Costa Rica",
  about: null,
  contactEmail: null,
  contactPhone: null,
  policies: { envios: null, devoluciones: null, privacidad: null },
};

const app = new Hono<Env>();
const files = (prefix: string, root: string) =>
  serveStatic({ root, rewriteRequestPath: (p) => p.slice(prefix.length) });
app.use("/static/*", files("/static", "./public"));
app.use("/ui/*", files("/ui", "../../packages/ui"));
app.use("/temas/*", files("/temas", "../../packages/themes"));

app.use("*", async (c, next) => {
  const host = (c.req.header("host") ?? "").toLowerCase().replace(/:\d+$/, "");
  if (host !== BASE_DOMAIN) return c.text("No encontrado", 404);
  const setCookies: string[] = [];
  c.set("slug", "");
  c.set("setCookies", setCookies);
  // Sin vendure-token: el canal del marketplace. La Cuenta Spora es la misma que en las tiendas.
  c.set(
    "shop",
    createShopClient({ url: SHOP_API, cookie: c.req.header("cookie"), onSetCookie: (all) => setCookies.push(...all) }),
  );
  await next();
  for (const cookie of setCookies) c.header("set-cookie", shareSessionCookie(cookie, BASE_DOMAIN), { append: true });
});

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

async function categories(c: Ctx): Promise<{ all: Category[]; top: Category[]; names: Map<string, string> }> {
  const res = await fetch(SHOP_API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "{ marketplaceCategories { slug name parentId } brands { slug name } }" }),
  });
  const { data } = (await res.json()) as {
    data: { marketplaceCategories: (Category & { parentId: string | null })[]; brands: Category[] };
  };
  void c;
  const all = data.marketplaceCategories;
  return {
    all,
    top: all.filter((x) => !x.parentId),
    names: new Map(
      [...all, ...data.brands.map((b) => ({ ...b, slug: `marca:${b.slug}` }))].map((x) => [x.slug, x.name]),
    ),
  };
}

async function render(c: Ctx, page: Page) {
  const result = await page(SPORA);
  if (result instanceof Response) return result;
  const [{ top }, customer] = await Promise.all([categories(c), c.get("shop").customer()]);
  const url = new URL(c.req.url);
  const { html } = await renderToStringAsync(() =>
    Shell({ customer, categories: top, q: url.searchParams.get("q") ?? "" }, result.content()),
  );
  const meta = result.meta;
  return c.html(
    `<!doctype html>
<html lang="es-CR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(meta.title)}</title>
    ${meta.description ? `<meta name="description" content="${escapeHtml(meta.description.slice(0, 160))}" />` : ""}
    ${meta.noindex ? `<meta name="robots" content="noindex" />` : ""}
    <link rel="canonical" href="${escapeHtml(`${url.origin}${url.pathname}`)}" />
    <link rel="stylesheet" href="/temas/base.css" />
    <link rel="stylesheet" href="/temas/estilos/suave.css" />
    <link rel="stylesheet" href="/ui/styles.css" />
    <link rel="stylesheet" href="/ui/store.css" />
    <link rel="stylesheet" href="/static/marketplace.css" />
  </head>
  <body>
    ${html}
    <script src="/static/marketplace.js" defer></script>
  </body>
</html>`,
    (result.status ?? 200) as 200,
  );
}

app.get("/", (c) =>
  render(c, async () => {
    const [{ top }, stores, products] = await Promise.all([
      categories(c),
      meili.index<MarketplaceStore>(STORES_INDEX).search("", { limit: 12 }),
      meili.index<MarketplaceProduct>(PRODUCTS_INDEX).search("", { limit: 12, filter: ["available = true"] }),
    ]);
    return {
      content: () => HomePage({ categories: top, stores: stores.hits, products: products.hits, storeUrl, productUrl }),
      meta: { title: "Spora · Tiendas de Costa Rica", description: "Productos de todas las tiendas de Spora." },
    };
  }),
);

/** Búsqueda con facetas. `fixed` = filtro que da la página (categoría o marca), que no se muestra como casilla. */
async function search(c: Ctx, title: (q: MarketQuery) => string, fixed: Partial<MarketQuery> = {}, action = "/buscar") {
  const url = new URL(c.req.url);
  const query = { ...parseMarketQuery(url.searchParams), ...fixed } as MarketQuery;
  const facetOf: Record<string, string> = {
    categoria: "categories",
    marca: "brand",
    tienda: "storeToken",
    moneda: "currency",
  };
  const selected: Record<string, string[]> = {
    categoria: query.categories,
    marca: query.brands,
    tienda: query.stores,
    moneda: query.currencies,
  };
  const attributeKeys = [...new Set(query.attributes.map((a) => a.split(":")[0]!))];
  // Una búsqueda con todo, y una por grupo elegido sin su propio filtro, para que sus otras opciones sigan visibles.
  const { results } = await meili.multiSearch({
    queries: [
      {
        indexUid: PRODUCTS_INDEX,
        q: query.q,
        filter: meiliFilter(query),
        facets: Object.values(facetOf).concat("attributes"),
        limit: PAGE_SIZE,
        offset: (query.page - 1) * PAGE_SIZE,
      },
      ...Object.entries(facetOf)
        .filter(([name]) => selected[name]!.length)
        .map(([, facet]) => ({
          indexUid: PRODUCTS_INDEX,
          q: query.q,
          filter: meiliFilter(query, facet),
          facets: [facet],
          limit: 0,
        })),
      ...attributeKeys.map((key) => ({
        indexUid: PRODUCTS_INDEX,
        q: query.q,
        filter: meiliFilter(query, `attributes:${key}`),
        facets: ["attributes"],
        limit: 0,
      })),
    ],
  });
  const main = results[0]!;
  const distribution = (facet: string) => {
    const own = results.slice(1).find((r) => r.facetDistribution?.[facet] && r.limit === 0 && facet !== "attributes");
    return (own ?? main).facetDistribution?.[facet] ?? {};
  };
  const [{ names }, stores] = await Promise.all([
    categories(c),
    meili.index<MarketplaceStore>(STORES_INDEX).search("", { limit: 200 }),
  ]);
  const storeNames = new Map(stores.hits.map((s) => [s.id, s.name]));
  const label: Record<string, (v: string) => string> = {
    categoria: (v) => names.get(v) ?? v,
    marca: (v) => names.get(`marca:${v}`) ?? v,
    tienda: (v) => storeNames.get(v) ?? v,
    moneda: (v) => (v === "CRC" ? "Colones" : "Dólares"),
  };
  const titles: Record<string, string> = { categoria: "Categoría", marca: "Marca", tienda: "Tienda", moneda: "Moneda" };
  // Atributos: la distribución de cada grupo elegido sale de su propia búsqueda (sin su filtro).
  const attributeDistribution = { ...(main.facetDistribution?.attributes ?? {}) };
  for (const [i, key] of attributeKeys.entries()) {
    const own =
      results[1 + Object.values(selected).filter((s) => s.length).length + i]?.facetDistribution?.attributes ?? {};
    for (const k of Object.keys(attributeDistribution)) if (k.startsWith(`${key}:`)) delete attributeDistribution[k];
    for (const [k, n] of Object.entries(own)) if (k.startsWith(`${key}:`)) attributeDistribution[k] = n;
  }
  const groups: FilterGroup[] = [
    ...Object.entries(facetOf)
      .filter(([name]) => !(name in fixedNames(fixed)))
      .map(([name, facet]) => ({
        name,
        label: titles[name]!,
        values: Object.entries(distribution(facet))
          .map(([value, count]) => ({
            value,
            label: label[name]!(value),
            count,
            selected: selected[name]!.includes(value),
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 15),
      }))
      .filter((g) => g.values.length > 0),
    ...attributeGroups(attributeDistribution, query.attributes),
  ];
  const total = main.estimatedTotalHits ?? main.hits.length;
  const next = new URLSearchParams(url.searchParams);
  next.set("pagina", String(query.page + 1));
  return {
    content: () =>
      SearchPage({
        title: title(query),
        total,
        groups,
        action,
        hidden: { q: query.q },
        min: query.min,
        max: query.max,
        products: main.hits as MarketplaceProduct[],
        productUrl,
        nextPage: query.page * PAGE_SIZE < total ? `${action}?${next}` : null,
      }),
  };
}

/** Los filtros fijos de la página (no se muestran como casillas). */
const fixedNames = (fixed: Partial<MarketQuery>) => ({
  ...(fixed.categories ? { categoria: true } : {}),
  ...(fixed.brands ? { marca: true } : {}),
});

app.get("/buscar", (c) =>
  render(c, async () => ({
    ...(await search(c, (q) => (q.q ? `Resultados para “${q.q}”` : "Todos los productos"))),
    meta: { title: "Buscar · Spora", noindex: true },
  })),
);

app.get("/categoria/:slug", (c) =>
  render(c, async () => {
    const slug = c.req.param("slug");
    const { names } = await categories(c);
    const name = names.get(slug);
    if (!name) return c.text("Categoría no encontrada", 404);
    return {
      ...(await search(c, () => name, { categories: [slug] }, `/categoria/${slug}`)),
      meta: { title: `${name} · Spora`, description: `${name} en las tiendas de Costa Rica de Spora.` },
    };
  }),
);

app.get("/marca/:slug", (c) =>
  render(c, async () => {
    const slug = c.req.param("slug");
    const { names } = await categories(c);
    const name = names.get(`marca:${slug}`);
    if (!name) return c.text("Marca no encontrada", 404);
    return {
      ...(await search(c, () => name, { brands: [slug] }, `/marca/${slug}`)),
      meta: { title: `${name} · Spora`, description: `Productos ${name} en las tiendas de Spora.` },
    };
  }),
);

app.get("/tiendas", (c) =>
  render(c, async () => {
    const stores = await meili.index<MarketplaceStore>(STORES_INDEX).search("", { limit: 200, sort: undefined });
    return {
      content: () => StoresPage(stores.hits, storeUrl),
      meta: { title: "Tiendas · Spora", description: "Directorio de las tiendas de Spora." },
    };
  }),
);

registerAccountRoutes(app, render, (token) => storeUrl(token));

serve({ fetch: app.fetch, port: PORT }, ({ port }) => console.log(`Marketplace en http://${BASE_DOMAIN}:${port}`));
