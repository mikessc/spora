// Búsqueda del marketplace en Meilisearch: de la URL al filtro, y de las facetas a los grupos del formulario.
import { commonAttributes, isCommonAttribute, slugify } from "@spora/shared";

export interface MarketQuery {
  q: string;
  categories: string[];
  brands: string[];
  stores: string[];
  currencies: ("CRC" | "USD")[];
  /** `talla:s`, `color:rojo`… */
  attributes: string[];
  /** Rango de precio en colones (unidades mayores). */
  min: number | null;
  max: number | null;
  page: number;
}

const SLUG = /^[a-z0-9-]{1,80}$/;
const pick = (params: URLSearchParams, name: string) =>
  [...new Set(params.getAll(name).map((v) => v.trim().toLowerCase()))].filter((v) => SLUG.test(v));
const amount = (value: string | null) => {
  const n = Number(value);
  return value && Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
};

/** Lee la URL. Todo lo que no sea un slug válido se descarta (los valores van a un filtro de Meilisearch). */
export function parseMarketQuery(params: URLSearchParams): MarketQuery {
  const attributes: string[] = [];
  for (const [key, value] of params) {
    const slug = slugify(value);
    if (isCommonAttribute(key) && SLUG.test(slug)) attributes.push(`${key}:${slug}`);
  }
  return {
    q: (params.get("q") ?? "").trim().slice(0, 100),
    categories: pick(params, "categoria"),
    brands: pick(params, "marca"),
    stores: pick(params, "tienda"),
    currencies: params.getAll("moneda").filter((c): c is "CRC" | "USD" => c === "CRC" || c === "USD"),
    attributes: [...new Set(attributes)],
    min: amount(params.get("min")),
    max: amount(params.get("max")),
    page: Math.max(1, Math.min(50, amount(params.get("pagina")) ?? 1)),
  };
}

const anyOf = (field: string, values: string[]) =>
  values.length ? [`${field} IN [${values.map((v) => JSON.stringify(v)).join(", ")}]`] : [];

/** Dentro de un filtro los valores suman (O); entre filtros se exigen todos (Y). Igual que en las tiendas. */
export function meiliFilter(query: MarketQuery, except?: string): string[] {
  const byAttribute = new Map<string, string[]>();
  for (const value of query.attributes) {
    const key = value.split(":")[0]!;
    byAttribute.set(key, [...(byAttribute.get(key) ?? []), value]);
  }
  return [
    ...(except === "categories" ? [] : anyOf("categories", query.categories)),
    ...(except === "brand" ? [] : anyOf("brand", query.brands)),
    ...(except === "storeToken" ? [] : anyOf("storeToken", query.stores)),
    ...(except === "currency" ? [] : anyOf("currency", query.currencies)),
    ...[...byAttribute].flatMap(([key, values]) => (except === `attributes:${key}` ? [] : anyOf("attributes", values))),
    ...(query.min != null ? [`priceCrc >= ${query.min * 100}`] : []),
    ...(query.max != null ? [`priceCrc <= ${query.max * 100}`] : []),
  ];
}

/** "s" → "S", "340-g" → "340 g", "rojo" → "Rojo". */
export const attributeLabel = (value: string) => {
  const text = value.replace(/-/g, " ");
  return text.length <= 3 ? text.toUpperCase() : text.charAt(0).toUpperCase() + text.slice(1);
};

export const attributeGroups = (distribution: Record<string, number>, selected: string[]) => {
  const groups = new Map<string, { value: string; label: string; count: number; selected: boolean }[]>();
  for (const [key, count] of Object.entries(distribution)) {
    const [name, value] = key.split(":") as [string, string];
    if (!isCommonAttribute(name)) continue;
    groups.set(name, [
      ...(groups.get(name) ?? []),
      { value, label: attributeLabel(value), count, selected: selected.includes(key) },
    ]);
  }
  return [...groups].map(([name, values]) => ({
    name,
    label: commonAttributes[name as keyof typeof commonAttributes],
    values,
  }));
};
