// Listados: tarjetas de producto y filtros. Solo servidor (HTML estático); los filtros se mejoran con una isla.
import { type CatalogProduct, type Facet, formatMoney } from "@spora/shared";
import { markIf } from "./ssr-form";
import { a, article, button, div, fieldset, form, h3, img, input, label, legend, li, p, span, ul } from "sibujs";

export function ProductCard(product: CatalogProduct) {
  return article("product-card", [
    a({ class: "product-card__link", href: `/producto/${product.slug}` }, [
      div("product-card__media", [
        product.image
          ? img({ src: `${product.image}?preset=small`, alt: product.name, width: 300, height: 300, loading: "lazy" })
          : span("product-card__placeholder", product.name.slice(0, 1)),
        product.available ? null : span("product-card__badge", "Agotado"),
      ]),
      h3("product-card__name", product.name),
      p("product-card__price", product.priceFrom ? formatMoney(product.priceFrom) : ""),
    ]),
  ]);
}

export function ProductGrid(products: CatalogProduct[]) {
  return ul(
    "product-grid",
    products.map((product) => li([ProductCard(product)])),
  );
}

export interface FilterPanelProps {
  facets: Facet[];
  /** A dónde envía el formulario (la misma página). */
  action: string;
  /** Búsqueda vigente, para no perderla al filtrar. */
  q?: string;
}

/**
 * Formulario GET: funciona sin JS (botón "Aplicar"). Con JS, la isla `filters` lo envía al cambiar una casilla.
 * `checked` va como atributo con `markIf`: SibuJS no lo serializa en el SSR.
 */
export function FilterPanel({ facets, action, q }: FilterPanelProps) {
  return form({ class: "filters", method: "get", action, "data-sibu-island": "filters", "aria-label": "Filtros" }, [
    q ? input({ type: "hidden", name: "q", value: q }) : null,
    ...facets.map((facet) =>
      fieldset("filters__group", [
        legend("filters__legend", facet.label),
        ...facet.values.map((value) =>
          label("filters__option", [
            input({
              type: "checkbox",
              name: facet.attribute,
              value: value.value,
              onElement: markIf(value.selected, "checked"),
            }),
            span("filters__label", value.label),
            span("filters__count", `(${value.count})`),
          ]),
        ),
      ]),
    ),
    div("filters__actions", [
      button({ class: "filters__apply", type: "submit" }, "Aplicar filtros"),
      a({ class: "filters__clear", href: q ? `${action}?q=${encodeURIComponent(q)}` : action }, "Quitar filtros"),
    ]),
  ]);
}
