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
  brand: string | null;
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
export const isCommonAttribute = (value: string): value is CommonAttribute => value in commonAttributes;

export interface AttributeValue {
  /** Normalizado con `slugify`: lo que va en la URL (`?color=rojo`). */
  value: string;
  label: string;
}

/** Un producto tal como lo muestran los listados (tarjeta + filtros). */
export interface CatalogProduct {
  id: string;
  name: string;
  slug: string;
  /** Texto plano de la descripción (sin el HTML del comercio). */
  description: string;
  image: string | null;
  brand: string | null;
  collectionSlugs: string[];
  /** El precio más bajo entre sus variantes. */
  priceFrom: Money | null;
  /** Hay al menos una variante con stock. */
  available: boolean;
  attributes: Partial<Record<CommonAttribute, AttributeValue[]>>;
}

/** Categoría propia de una tienda (colección de Vendure), mapeada a una global. */
export interface StoreCollection {
  name: string;
  slug: string;
  marketplaceCategory: string | null;
}

export interface CartLine {
  id: string;
  quantity: number;
  productName: string;
  productSlug: string;
  variantName: string;
  image: string | null;
  unitPrice: Money;
  linePrice: Money;
}
export interface Cart {
  code: string;
  lines: CartLine[];
  totalQuantity: number;
  subTotal: Money;
  total: Money;
}

/** "Camisetas & Polos" → "camisetas-polos". */
export const slugify = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** La descripción del comercio como texto plano, en párrafos. Nunca se inserta su HTML. */
export const htmlToParagraphs = (html: string): string[] =>
  html
    .split(/<\/p>|<br\s*\/?>|\n/i)
    .map((chunk) =>
      chunk
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .trim(),
    )
    .filter(Boolean);
