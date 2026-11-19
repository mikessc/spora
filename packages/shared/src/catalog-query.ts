// Filtros y búsqueda de listados. Sin dependencias: lo usa la tienda (en memoria) y lo usará el marketplace.
import {
  type AttributeValue,
  type CatalogProduct,
  type CommonAttribute,
  commonAttributes,
  isCommonAttribute,
  slugify,
} from "./catalog";

export interface CatalogQuery {
  /** Texto buscado, tal como lo escribió el cliente. */
  q: string;
  /** Valores elegidos por atributo: `?talla=s&talla=m&color=rojo`. */
  attributes: Partial<Record<CommonAttribute, string[]>>;
}

export interface Facet {
  attribute: CommonAttribute;
  label: string;
  values: (AttributeValue & { count: number; selected: boolean })[];
}

export function parseCatalogQuery(params: URLSearchParams): CatalogQuery {
  const attributes: CatalogQuery["attributes"] = {};
  for (const [key, value] of params) {
    if (isCommonAttribute(key) && value) (attributes[key] ??= []).push(slugify(value));
  }
  return { q: (params.get("q") ?? "").trim().slice(0, 100), attributes };
}

const matchesText = (product: CatalogProduct, q: string) => {
  const terms = slugify(q).split("-").filter(Boolean);
  const haystack = slugify(`${product.name} ${product.description} ${product.brand ?? ""}`);
  return terms.every((term) => haystack.includes(term));
};

/** Dentro de un atributo los valores suman (O); entre atributos se exigen todos (Y). */
const matchesAttributes = (product: CatalogProduct, attributes: CatalogQuery["attributes"]) =>
  Object.entries(attributes).every(([attribute, wanted]) => {
    if (!wanted?.length) return true;
    const values = product.attributes[attribute as CommonAttribute]?.map((v) => v.value) ?? [];
    return wanted.some((w) => values.includes(w));
  });

// ponytail: filtra por producto, no por variante (S de un color y Rojo de otra talla también cuenta). Para catálogos
// de tienda (cientos de productos) en memoria alcanza; el marketplace usa Meilisearch.
export function filterCatalog(products: CatalogProduct[], query: CatalogQuery): CatalogProduct[] {
  return products.filter((p) => (!query.q || matchesText(p, query.q)) && matchesAttributes(p, query.attributes));
}

/** Facetas de un listado. Los conteos de cada atributo ignoran su propia selección, para poder sumar valores. */
export function facets(products: CatalogProduct[], query: CatalogQuery): Facet[] {
  const base = query.q ? products.filter((p) => matchesText(p, query.q)) : products;
  return (Object.keys(commonAttributes) as CommonAttribute[])
    .map((attribute) => {
      const others = { ...query.attributes, [attribute]: [] };
      const counts = new Map<string, AttributeValue & { count: number }>();
      for (const product of base.filter((p) => matchesAttributes(p, others))) {
        for (const v of product.attributes[attribute] ?? []) {
          const entry = counts.get(v.value) ?? { ...v, count: 0 };
          entry.count++;
          counts.set(v.value, entry);
        }
      }
      const selected = query.attributes[attribute] ?? [];
      return {
        attribute,
        label: commonAttributes[attribute],
        values: [...counts.values()].map((v) => ({ ...v, selected: selected.includes(v.value) })),
      };
    })
    .filter((facet) => facet.values.length > 0);
}
