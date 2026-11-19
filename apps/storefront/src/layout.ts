// Armazón de todas las páginas de una tienda. Solo servidor.
import type { Customer, Store, StoreCollection } from "@spora/api-client";
import { a, button, div, footer, form, header, img, input, label, li, nav, p, span, ul } from "sibujs";

export const policyPages = {
  envios: "Envíos",
  devoluciones: "Cambios y devoluciones",
  privacidad: "Privacidad",
} as const;
export type PolicyPage = keyof typeof policyPages;

export interface ShellData {
  store: Store;
  collections: StoreCollection[];
  cartCount: number;
  /** Cliente con sesión (Cuenta Spora) o `null`. */
  customer: Customer | null;
  /** Búsqueda vigente (se muestra en el buscador). */
  query?: string;
}

export function Shell({ store, collections, cartCount, customer, query }: ShellData, content: Node) {
  const policies = (Object.keys(policyPages) as PolicyPage[]).filter((key) => store.policies[key]);
  return div("store", [
    header("store-header", [
      a({ class: "store-header__brand", href: "/" }, [
        store.logo ? img({ class: "store-header__logo", src: `${store.logo}?preset=thumb`, alt: "" }) : null,
        span("store-header__name", store.name),
      ]),
      form({ class: "store-search", method: "get", action: "/buscar", role: "search" }, [
        label({ class: "sr-only", for: "buscar" }, "Buscar en la tienda"),
        input({ id: "buscar", class: "store-search__input", type: "search", name: "q", value: query ?? "" }),
        button({ class: "store-search__button", type: "submit" }, "Buscar"),
      ]),
      customer
        ? a({ class: "store-header__account", href: "/cuenta" }, `Hola, ${customer.firstName}`)
        : a({ class: "store-header__account", href: "/cuenta/ingresar" }, "Ingresar"),
      // Isla `cart-count`: el contador se actualiza cuando una isla agrega al carrito.
      a({ class: "store-header__cart", href: "/carrito", "data-sibu-island": "cart-count" }, [
        "Carrito ",
        span({ class: "store-header__count", "data-ref": "count" }, String(cartCount)),
      ]),
    ]),
    collections.length
      ? nav({ class: "store-nav", "aria-label": "Categorías" }, [
          ul(collections.map((c) => li([a({ href: `/categoria/${c.slug}` }, c.name)]))),
        ])
      : null,
    content,
    footer("store-footer", [
      policies.length
        ? nav({ class: "store-footer__nav", "aria-label": "Políticas" }, [
            ul(policies.map((key) => li([a({ href: `/politicas/${key}` }, policyPages[key])]))),
          ])
        : null,
      store.contactEmail || store.contactPhone
        ? p("store-footer__contact", [store.contactEmail, store.contactPhone].filter(Boolean).join(" · "))
        : null,
      p("store-footer__spora", `${store.name} · Tienda en Spora`),
    ]),
  ]);
}
