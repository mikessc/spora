// Cliente de la Shop API de Vendure. Sin dependencias de SibuJS: funciona en el servidor y en el navegador.

export type CurrencyCode = "CRC" | "USD";
/** Dinero en enteros de la unidad menor (céntimos/centavos), siempre con su moneda. */
export interface Money {
  amount: number;
  currency: CurrencyCode;
}
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
export interface CartSummary {
  code: string;
  totalQuantity: number;
  total: Money;
}

export class ShopApiError extends Error {}

export interface ShopClientOptions {
  /** URL de la Shop API, p. ej. `http://localhost:3000/shop-api` (servidor) o `/shop-api` (navegador, vía proxy). */
  url: string;
  /** Token del canal (la tienda). En el navegador lo pone el proxy. */
  channelToken?: string;
}

const PRODUCT_QUERY = /* GraphQL */ `
  query Product($slug: String!) {
    product(slug: $slug) {
      id name slug description
      assets { id preview width height }
      optionGroups { id name options { id name } }
      variants {
        id sku name priceWithTax currencyCode stockLevel
        featuredAsset { id }
        options { id }
      }
    }
  }`;

const ADD_ITEM_MUTATION = /* GraphQL */ `
  mutation AddItem($variantId: ID!, $quantity: Int!) {
    addItemToOrder(productVariantId: $variantId, quantity: $quantity) {
      __typename
      ... on Order { code totalQuantity totalWithTax currencyCode }
      ... on ErrorResult { errorCode message }
    }
  }`;

interface RawVariant {
  id: string;
  sku: string;
  name: string;
  priceWithTax: number;
  currencyCode: CurrencyCode;
  stockLevel: StockLevel;
  featuredAsset: { id: string } | null;
  options: { id: string }[];
}
interface RawProduct extends Omit<Product, "descriptionHtml" | "variants"> {
  description: string;
  variants: RawVariant[];
}
type RawAddItem =
  | { __typename: "Order"; code: string; totalQuantity: number; totalWithTax: number; currencyCode: CurrencyCode }
  | { __typename: string; errorCode: string; message: string };

export function createShopClient({ url, channelToken }: ShopClientOptions) {
  async function request<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (channelToken) headers["vendure-token"] = channelToken;
    const res = await fetch(url, { method: "POST", headers, credentials: "same-origin", body: JSON.stringify({ query, variables }) });
    if (!res.ok) throw new ShopApiError(`Shop API respondió ${res.status}`);
    const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
    if (body.errors?.length || !body.data) throw new ShopApiError(body.errors?.map((e) => e.message).join("; ") ?? "Respuesta vacía");
    return body.data;
  }

  return {
    async product(slug: string): Promise<Product | null> {
      const { product } = await request<{ product: RawProduct | null }>(PRODUCT_QUERY, { slug });
      if (!product) return null;
      const { description, variants, ...rest } = product;
      return {
        ...rest,
        descriptionHtml: description,
        variants: variants.map((v) => ({
          id: v.id,
          sku: v.sku,
          name: v.name,
          price: { amount: v.priceWithTax, currency: v.currencyCode },
          stockLevel: v.stockLevel,
          featuredAssetId: v.featuredAsset?.id ?? null,
          optionIds: v.options.map((o) => o.id),
        })),
      };
    },

    async addItemToOrder(variantId: string, quantity = 1): Promise<CartSummary> {
      const { addItemToOrder: r } = await request<{ addItemToOrder: RawAddItem }>(ADD_ITEM_MUTATION, { variantId, quantity });
      if (!("code" in r) || r.__typename !== "Order") throw new ShopApiError("message" in r ? r.message : "No se pudo agregar");
      return { code: r.code, totalQuantity: r.totalQuantity, total: { amount: r.totalWithTax, currency: r.currencyCode } };
    },
  };
}

export type ShopClient = ReturnType<typeof createShopClient>;
