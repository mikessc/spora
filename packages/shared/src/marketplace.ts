// Documentos del índice global del marketplace (Meilisearch). Los escribe el backend y los lee spora.cr.
import type { Money } from "./money";

export const PRODUCTS_INDEX = "productos";
export const STORES_INDEX = "tiendas";

export interface MarketplaceProduct {
  /** `<tienda>-<id de producto>`. */
  id: string;
  slug: string;
  name: string;
  description: string;
  image: string | null;
  storeToken: string;
  storeName: string;
  brand: string | null;
  brandName: string | null;
  /** La categoría global y todas sus ancestras (para filtrar por "Moda" y encontrar "Moda › Hombre › Camisetas"). */
  categories: string[];
  /** Atributos comunes normalizados: `talla:s`, `color:rojo`. */
  attributes: string[];
  attributeLabels: Record<string, string>;
  price: Money;
  /** Precio en céntimos de colón, para filtrar y ordenar entre tiendas en CRC y USD. */
  priceCrc: number;
  currency: Money["currency"];
  available: boolean;
}

export interface MarketplaceStore {
  /** Token del canal = subdominio. */
  id: string;
  name: string;
  tagline: string | null;
  logo: string | null;
  currency: Money["currency"];
  productCount: number;
  /** Categorías globales de primer nivel en las que vende. */
  categories: string[];
}
