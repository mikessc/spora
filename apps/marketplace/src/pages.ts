// Páginas del marketplace (spora.cr). Solo servidor. Usa las clases de @spora/ui (mismo sistema de estilos).
import type { Customer } from "@spora/api-client";
import { formatMoney, type MarketplaceProduct, type MarketplaceStore } from "@spora/shared";
import { type FilterGroup, FilterPanel } from "@spora/ui";
import {
  a,
  article,
  button,
  div,
  footer,
  form,
  h1,
  h2,
  h3,
  header,
  img,
  input,
  label,
  li,
  main,
  nav,
  p,
  section,
  span,
  ul,
} from "sibujs";

export interface Category {
  slug: string;
  name: string;
}

export function Shell(
  { customer, categories, q }: { customer: Customer | null; categories: Category[]; q: string },
  content: Node,
) {
  return div("store", [
    header("store-header", [
      a({ class: "store-header__brand", href: "/" }, [span("store-header__name", "Spora")]),
      form({ class: "store-search", method: "get", action: "/buscar", role: "search" }, [
        label({ class: "sr-only", for: "buscar" }, "Buscar en todas las tiendas"),
        input({ id: "buscar", class: "store-search__input", type: "search", name: "q", value: q }),
        button({ class: "store-search__button", type: "submit" }, "Buscar"),
      ]),
      a({ class: "store-header__account", href: "/tiendas" }, "Tiendas"),
      customer
        ? a({ class: "store-header__account", href: "/cuenta" }, `Hola, ${customer.firstName}`)
        : a({ class: "store-header__account", href: "/cuenta/ingresar" }, "Ingresar"),
    ]),
    nav({ class: "store-nav", "aria-label": "Categorías" }, [
      ul(categories.map((c) => li([a({ href: `/categoria/${c.slug}` }, c.name)]))),
    ]),
    content,
    footer("store-footer", [
      p("store-footer__spora", "Spora · Tiendas de Costa Rica. Cada compra se hace en su tienda."),
    ]),
  ]);
}

/** Tarjeta de un producto de cualquier tienda: lleva a la tienda para comprar. */
function MarketCard(product: MarketplaceProduct, href: string) {
  return article("product-card", [
    a({ class: "product-card__link", href }, [
      div("product-card__media", [
        product.image
          ? img({ src: `${product.image}?preset=small`, alt: product.name, width: 300, height: 300, loading: "lazy" })
          : span("product-card__placeholder", product.name.slice(0, 1)),
        product.available ? null : span("product-card__badge", "Agotado"),
      ]),
      h3("product-card__name", product.name),
      p("product-card__price", [
        formatMoney(product.price),
        product.currency === "USD" ? ` · ≈ ${formatMoney({ amount: product.priceCrc, currency: "CRC" })}` : "",
      ]),
      p("product-card__store", product.storeName),
    ]),
  ]);
}

export function ProductGrid(products: MarketplaceProduct[], productUrl: (p: MarketplaceProduct) => string) {
  return ul(
    "product-grid",
    products.map((p) => li([MarketCard(p, productUrl(p))])),
  );
}

function StoreCards(stores: MarketplaceStore[], storeUrl: (token: string) => string) {
  return ul(
    "store-grid",
    stores.map((s) =>
      li([
        a({ class: "store-card", href: storeUrl(s.id) }, [
          h3("store-card__name", s.name),
          s.tagline ? p("store-card__tagline", s.tagline) : null,
          p(
            "store-card__meta",
            `${s.productCount} productos · precios en ${s.currency === "CRC" ? "colones" : "dólares"}`,
          ),
        ]),
      ]),
    ),
  );
}

export function HomePage(data: {
  categories: Category[];
  stores: MarketplaceStore[];
  products: MarketplaceProduct[];
  storeUrl: (token: string) => string;
  productUrl: (p: MarketplaceProduct) => string;
}) {
  return main("listing", [
    section("store-hero", [
      p("store-hero__tagline", "Las tiendas de Costa Rica en un solo lugar"),
      p(
        "store-hero__about",
        "Busque entre los productos de todas las tiendas de Spora y compre directo a cada comercio.",
      ),
    ]),
    h2("listing__title", "Categorías"),
    ul(
      "category-list",
      data.categories.map((c) => li([a({ href: `/categoria/${c.slug}` }, c.name)])),
    ),
    h2("listing__title", "Tiendas"),
    StoreCards(data.stores, data.storeUrl),
    h2("listing__title", "Productos"),
    ProductGrid(data.products, data.productUrl),
  ]);
}

export function SearchPage(data: {
  title: string;
  total: number;
  groups: FilterGroup[];
  action: string;
  hidden: Record<string, string>;
  min: number | null;
  max: number | null;
  products: MarketplaceProduct[];
  productUrl: (p: MarketplaceProduct) => string;
  nextPage: string | null;
}) {
  const price = (name: "min" | "max", text: string, value: number | null) =>
    label("filters__price", [
      span(text),
      input({
        type: "number",
        name,
        min: "0",
        step: "500",
        inputmode: "numeric",
        value: value == null ? "" : String(value),
      }),
    ]);
  return main("listing", [
    h1("listing__title", data.title),
    div("listing__body", [
      FilterPanel({
        groups: data.groups,
        action: data.action,
        hidden: data.hidden,
        extra: [
          div("filters__group", [
            span("filters__legend", "Precio (colones)"),
            price("min", "Desde ₡", data.min),
            price("max", "Hasta ₡", data.max),
          ]),
        ],
      }),
      section({ class: "listing__results", "aria-live": "polite" }, [
        p("listing__count", data.total === 1 ? "1 producto" : `${data.total} productos`),
        data.products.length
          ? ProductGrid(data.products, data.productUrl)
          : p("listing__empty", "No hay productos que coincidan. Pruebe con otros filtros o palabras."),
        data.nextPage ? a({ class: "listing__more", href: data.nextPage }, "Ver más productos") : null,
      ]),
    ]),
  ]);
}

export function StoresPage(stores: MarketplaceStore[], storeUrl: (token: string) => string) {
  return main("listing", [h1("listing__title", "Tiendas"), StoreCards(stores, storeUrl)]);
}
