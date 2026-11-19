// Cliente de la Shop API de Vendure. Sin dependencias de SibuJS: funciona en el servidor y en el navegador.

import type { CurrencyCode, Money, Product, StockLevel } from "@spora/shared";

export type * from "@spora/shared";

export interface CartSummary {
  code: string;
  totalQuantity: number;
  total: Money;
}

export class ShopApiError extends Error {
  constructor(
    message: string,
    /** `STORE_NOT_ACTIVE` cuando la tienda existe pero su comercio no está activo. */
    readonly code?: string,
  ) {
    super(message);
  }
}

export interface Store {
  token: string;
  name: string;
  currency: CurrencyCode;
  designStyle: string;
}

export interface ShopClientOptions {
  /** URL de la Shop API, p. ej. `http://localhost:3000/shop-api` (servidor) o `/shop-api` (navegador, vía proxy). */
  url: string;
  /** Token del canal (la tienda). En el navegador lo pone el proxy. */
  channelToken?: string;
}

const STORE_QUERY = /* GraphQL */ `
  query Store {
    activeChannel {
      token
      defaultCurrencyCode
      customFields {
        storeName
        designStyle
      }
    }
  }
`;

const PRODUCT_QUERY = /* GraphQL */ `
  query Product($slug: String!) {
    product(slug: $slug) {
      id
      name
      slug
      description
      assets {
        id
        preview
        width
        height
      }
      optionGroups {
        id
        name
        options {
          id
          name
        }
      }
      variants {
        id
        sku
        name
        priceWithTax
        currencyCode
        stockLevel
        featuredAsset {
          id
        }
        options {
          id
        }
      }
    }
  }
`;

const ADD_ITEM_MUTATION = /* GraphQL */ `
  mutation AddItem($variantId: ID!, $quantity: Int!) {
    addItemToOrder(productVariantId: $variantId, quantity: $quantity) {
      __typename
      ... on Order {
        code
        totalQuantity
        totalWithTax
        currencyCode
      }
      ... on ErrorResult {
        errorCode
        message
      }
    }
  }
`;

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
    const res = await fetch(url, {
      method: "POST",
      headers,
      credentials: "same-origin",
      body: JSON.stringify({ query, variables }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      data?: T;
      errors?: { message: string; extensions?: { code?: string } }[];
    };
    if (!res.ok || body.errors?.length || !body.data) {
      const message = body.errors?.map((e) => e.message).join("; ") || `Shop API respondió ${res.status}`;
      throw new ShopApiError(message, body.errors?.[0]?.extensions?.code);
    }
    return body.data;
  }

  return {
    async store(): Promise<Store> {
      const { activeChannel: c } = await request<{
        activeChannel: {
          token: string;
          defaultCurrencyCode: CurrencyCode;
          customFields: { storeName: string | null; designStyle: string };
        };
      }>(STORE_QUERY, {});
      return {
        token: c.token,
        name: c.customFields.storeName ?? c.token,
        currency: c.defaultCurrencyCode,
        designStyle: c.customFields.designStyle,
      };
    },

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
      const { addItemToOrder: r } = await request<{ addItemToOrder: RawAddItem }>(ADD_ITEM_MUTATION, {
        variantId,
        quantity,
      });
      if (!("code" in r) || r.__typename !== "Order")
        throw new ShopApiError("message" in r ? r.message : "No se pudo agregar");
      return {
        code: r.code,
        totalQuantity: r.totalQuantity,
        total: { amount: r.totalWithTax, currency: r.currencyCode },
      };
    },
  };
}

export type ShopClient = ReturnType<typeof createShopClient>;
