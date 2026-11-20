// Listados: tarjetas de producto y filtros. Solo servidor (HTML estático); los filtros se mejoran con una isla.
import { type CatalogProduct, type Facet, formatMoney } from "@spora/shared";
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

/** Un grupo de casillas: `name` es el campo del formulario (`talla`, `categoria`, `tienda`…). */
export interface FilterGroup {
  name: string;
  label: string;
  values: { value: string; label: string; count: number; selected: boolean }[];
}

/** Las facetas de atributos comunes de una tienda, como grupos de filtros. */
export const facetGroups = (facets: Facet[]): FilterGroup[] =>
  facets.map((f) => ({ name: f.attribute, label: f.label, values: f.values }));

export interface FilterPanelProps {
  groups: FilterGroup[];
  /** A dónde envía el formulario (la misma página). */
  action: string;
  /** Campos que se conservan al filtrar (la búsqueda, una categoría fija…). */
  hidden?: Record<string, string>;
  /** Controles extra al final (p. ej. rango de precio). */
  extra?: Node[];
}

/**
 * Formulario GET: funciona sin JS (botón "Aplicar"). Con JS, la isla `filters` lo envía al cambiar una casilla.
 */
export function FilterPanel({ groups, action, hidden = {}, extra = [] }: FilterPanelProps) {
  const kept = Object.entries(hidden).filter(([, value]) => value);
  const clearHref = kept.length ? `${action}?${new URLSearchParams(kept)}` : action;
  return form({ class: "filters", method: "get", action, "data-sibu-island": "filters", "aria-label": "Filtros" }, [
    ...kept.map(([name, value]) => input({ type: "hidden", name, value })),
    ...groups.map((group) =>
      fieldset("filters__group", [
        legend("filters__legend", group.label),
        ...group.values.map((value) =>
          label("filters__option", [
            input({
              type: "checkbox",
              name: group.name,
              value: value.value,
              checked: value.selected,
            }),
            span("filters__label", value.label),
            span("filters__count", `(${value.count})`),
          ]),
        ),
      ]),
    ),
    ...extra,
    div("filters__actions", [
      button({ class: "filters__apply", type: "submit" }, "Aplicar filtros"),
      a({ class: "filters__clear", href: clearHref }, "Quitar filtros"),
    ]),
  ]);
}
