// Páginas de la tienda (salvo la ficha, en product-page.ts). Solo servidor.
import type { Cart, CatalogProduct, Store } from "@spora/api-client";
import { type CatalogQuery, facets, filterCatalog, formatMoney } from "@spora/shared";
import { FilterPanel, ProductGrid } from "@spora/ui";
import {
  a,
  button,
  div,
  form,
  h1,
  img,
  input,
  label,
  main,
  p,
  section,
  span,
  table,
  tbody,
  td,
  th,
  thead,
  tr,
} from "sibujs";
import type { PolicyPage } from "./layout";
import { policyPages } from "./layout";

const paragraphs = (text: string) =>
  text
    .split(/\n+/)
    .filter(Boolean)
    .map((line) => p(line));

export interface ListingProps {
  title: string;
  products: CatalogProduct[];
  query: CatalogQuery;
  /** URL del listado (a dónde envía el formulario de filtros). */
  action: string;
  intro?: Node | null;
}

export function Listing({ title, products, query, action, intro }: ListingProps) {
  const found = filterCatalog(products, query);
  const available = facets(products, query);
  return main("listing", [
    intro ?? null,
    h1("listing__title", title),
    div("listing__body", [
      available.length ? FilterPanel({ facets: available, action, q: query.q }) : null,
      section({ class: "listing__results", "aria-live": "polite" }, [
        p("listing__count", found.length === 1 ? "1 producto" : `${found.length} productos`),
        found.length
          ? ProductGrid(found)
          : p("listing__empty", "No hay productos que coincidan. Pruebe con otros filtros o palabras."),
      ]),
    ]),
  ]);
}

export function StoreIntro(store: Store) {
  return section("store-hero", [
    store.tagline ? p("store-hero__tagline", store.tagline) : null,
    store.about ? p("store-hero__about", store.about) : null,
  ]);
}

export function CartPage(cart: Cart | null, notice?: string) {
  if (!cart?.lines.length) {
    return main("cart", [
      h1("cart__title", "Carrito"),
      notice ? p({ class: "cart__notice", role: "alert" }, notice) : null,
      p("cart__empty", "Su carrito está vacío."),
      a({ class: "cart__continue", href: "/" }, "Ver productos"),
    ]);
  }
  return main("cart", [
    h1("cart__title", "Carrito"),
    notice ? p({ class: "cart__notice", role: "alert" }, notice) : null,
    table("cart__table", [
      thead([tr([th({ scope: "col" }, "Producto"), th({ scope: "col" }, "Cantidad"), th({ scope: "col" }, "Total")])]),
      tbody(
        cart.lines.map((line) =>
          tr("cart__line", [
            td("cart__product", [
              line.image
                ? img({ class: "cart__image", src: `${line.image}?preset=thumb`, alt: "", width: 64, height: 64 })
                : null,
              div([
                a({ href: `/producto/${line.productSlug}` }, line.variantName),
                span("cart__unit", `${formatMoney(line.unitPrice)} c/u`),
              ]),
            ]),
            td([
              // Sin JS: formularios simples que vuelven al carrito (POST → redirección).
              form({ class: "cart__qty", method: "post", action: "/carrito/linea" }, [
                input({ type: "hidden", name: "linea", value: line.id }),
                label({ class: "sr-only", for: `cantidad-${line.id}` }, `Cantidad de ${line.variantName}`),
                input({
                  id: `cantidad-${line.id}`,
                  class: "cart__qty-input",
                  type: "number",
                  name: "cantidad",
                  min: "0",
                  max: "99",
                  value: String(line.quantity),
                }),
                button({ class: "cart__update", type: "submit" }, "Actualizar"),
                button({ class: "cart__remove", type: "submit", name: "quitar", value: "1" }, "Quitar"),
              ]),
            ]),
            td("cart__line-total", formatMoney(line.linePrice)),
          ]),
        ),
      ),
    ]),
    div("cart__summary", [
      p("cart__total", [span("Total "), span("cart__total-amount", formatMoney(cart.total))]),
      p("cart__note", "Impuestos incluidos. El envío se calcula al pagar."),
      a({ class: "cart__checkout", href: "/checkout/datos" }, "Ir a pagar"),
    ]),
  ]);
}

export function PolicyPageView(store: Store, page: PolicyPage) {
  return main("policy", [
    h1("policy__title", policyPages[page]),
    div("policy__text", paragraphs(store.policies[page] ?? "")),
  ]);
}

export function NotFoundPage(title: string, text: string) {
  return main("not-found", [h1(title), p(text), a({ href: "/" }, "Volver al inicio")]);
}

/** Resultado de página 404 dentro de la tienda. */
export const notFound = (text: string) => ({
  content: () => NotFoundPage("No encontrado", text),
  meta: { title: "No encontrado", noindex: true },
  status: 404,
});
