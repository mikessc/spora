import type { Money } from "./money";

export type StockLevel = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";

export interface Asset {
  id: string;
  preview: string;
  width: number;
  height: number;
}
export interface OptionGroup {
  id: string;
  name: string;
  options: { id: string; name: string }[];
}
export interface Variant {
  id: string;
  sku: string;
  name: string;
  price: Money;
  stockLevel: StockLevel;
  featuredAssetId: string | null;
  optionIds: string[];
}
export interface Product {
  id: string;
  name: string;
  slug: string;
  /** HTML que escribe el comercio en el admin de Vendure. */
  descriptionHtml: string;
  assets: Asset[];
  optionGroups: OptionGroup[];
  variants: Variant[];
}

/**
 * Atributos comunes entre tiendas (PLAN §1). Cada grupo de opciones de un producto se mapea a uno; los valores se
 * normalizan con `slugify(nombre de la opción)`, así "Rojo" de una tienda y "rojo" de otra filtran juntos.
 */
export const commonAttributes = {
  talla: "Talla",
  color: "Color",
  material: "Material",
  tamano: "Tamaño",
  capacidad: "Capacidad",
  sabor: "Sabor",
} as const;
export type CommonAttribute = keyof typeof commonAttributes;

/** "Camisetas & Polos" → "camisetas-polos". */
export const slugify = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
