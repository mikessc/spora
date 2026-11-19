// Cliente de la Shop API de Vendure. Sin dependencias de SibuJS: funciona en el servidor y en el navegador.
import {
  type AttributeValue,
  type Cart,
  type CatalogProduct,
  type CommonAttribute,
  type CurrencyCode,
  htmlToParagraphs,
  isCommonAttribute,
  type Money,
  type Product,
  slugify,
  type StockLevel,
  type StoreCollection,
} from "@spora/shared";

export type * from "@spora/shared";

export class ShopApiError extends Error {
  constructor(
    message: string,
    /** `STORE_NOT_ACTIVE` cuando la tienda existe pero su comercio no está activo; `CHANNEL_NOT_FOUND` si no existe. */
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
  primaryColor: string | null;
  font: string;
  logo: string | null;
  tagline: string | null;
  about: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  policies: { envios: string | null; devoluciones: string | null; privacidad: string | null };
}

export interface ShopClientOptions {
  /** URL de la Shop API, p. ej. `http://localhost:3000/shop-api` (servidor) o `/shop-api` (navegador, vía proxy). */
  url: string;
  /** Token del canal (la tienda). En el navegador lo pone el proxy. */
  channelToken?: string;
  /** En el servidor: la cookie del cliente, para leer su carrito y su sesión. */
  cookie?: string;
  /** En el servidor: recibe las `Set-Cookie` de Vendure para reenviarlas al navegador. */
  onSetCookie?: (cookies: string[]) => void;
}

const STORE_QUERY = /* GraphQL */ `
  query Store {
    activeChannel {
      token
      defaultCurrencyCode
      customFields {
        storeName
        designStyle
        primaryColor
        font
        logo {
          preview
        }
        tagline
        about
        contactEmail
        contactPhone
        shippingPolicy
        returnsPolicy
        privacyPolicy
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
      customFields {
        brand
      }
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

const CATALOG_QUERY = /* GraphQL */ `
  query Catalog($skip: Int!) {
    products(options: { take: 100, skip: $skip }) {
      totalItems
      items {
        id
        name
        slug
        description
        customFields {
          brand
        }
        featuredAsset {
          preview
        }
        collections {
          slug
        }
        optionGroups {
          customFields {
            attribute
          }
          options {
            id
            name
          }
        }
        variants {
          priceWithTax
          currencyCode
          stockLevel
        }
      }
    }
  }
`;

const COLLECTIONS_QUERY = /* GraphQL */ `
  query Collections {
    collections(options: { take: 100, topLevelOnly: false }) {
      items {
        name
        slug
        customFields {
          marketplaceCategory
        }
      }
    }
  }
`;

const ORDER = /* GraphQL */ `
  code
  totalQuantity
  subTotalWithTax
  totalWithTax
  currencyCode
  lines {
    id
    quantity
    unitPriceWithTax
    linePriceWithTax
    featuredAsset {
      preview
    }
    productVariant {
      name
      product {
        name
        slug
      }
    }
  }
`;

const ACTIVE_ORDER_QUERY = `query ActiveOrder { activeOrder { ${ORDER} } }`;

const ORDER_RESULT = `
  __typename
  ... on Order { ${ORDER} }
  ... on ErrorResult {
    errorCode
    message
  }
`;

const ADD_ITEM_MUTATION = `mutation AddItem($variantId: ID!, $quantity: Int!) {
  addItemToOrder(productVariantId: $variantId, quantity: $quantity) { ${ORDER_RESULT} }
}`;
const ADJUST_LINE_MUTATION = `mutation AdjustLine($lineId: ID!, $quantity: Int!) {
  adjustOrderLine(orderLineId: $lineId, quantity: $quantity) { ${ORDER_RESULT} }
}`;
const REMOVE_LINE_MUTATION = `mutation RemoveLine($lineId: ID!) {
  removeOrderLine(orderLineId: $lineId) { ${ORDER_RESULT} }
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
interface RawProduct extends Omit<Product, "descriptionHtml" | "variants" | "brand"> {
  description: string;
  customFields: { brand: string | null };
  variants: RawVariant[];
}
interface RawCatalogProduct {
  id: string;
  name: string;
  slug: string;
  description: string;
  customFields: { brand: string | null };
  featuredAsset: { preview: string } | null;
  collections: { slug: string }[];
  optionGroups: { customFields: { attribute: string | null }; options: { id: string; name: string }[] }[];
  variants: { priceWithTax: number; currencyCode: CurrencyCode; stockLevel: StockLevel }[];
}
interface RawOrder {
  code: string;
  totalQuantity: number;
  subTotalWithTax: number;
  totalWithTax: number;
  currencyCode: CurrencyCode;
  lines: {
    id: string;
    quantity: number;
    unitPriceWithTax: number;
    linePriceWithTax: number;
    featuredAsset: { preview: string } | null;
    productVariant: { name: string; product: { name: string; slug: string } };
  }[];
}
type RawOrderResult = ({ __typename: "Order" } & RawOrder) | { __typename: string; errorCode: string; message: string };

const toCart = (o: RawOrder): Cart => {
  const money = (amount: number): Money => ({ amount, currency: o.currencyCode });
  return {
    code: o.code,
    totalQuantity: o.totalQuantity,
    subTotal: money(o.subTotalWithTax),
    total: money(o.totalWithTax),
    lines: o.lines.map((l) => ({
      id: l.id,
      quantity: l.quantity,
      productName: l.productVariant.product.name,
      productSlug: l.productVariant.product.slug,
      variantName: l.productVariant.name,
      image: l.featuredAsset?.preview ?? null,
      unitPrice: money(l.unitPriceWithTax),
      linePrice: money(l.linePriceWithTax),
    })),
  };
};

const toCatalogProduct = (p: RawCatalogProduct): CatalogProduct => {
  const attributes: Partial<Record<CommonAttribute, AttributeValue[]>> = {};
  for (const group of p.optionGroups) {
    const attribute = group.customFields.attribute;
    if (!attribute || !isCommonAttribute(attribute)) continue;
    attributes[attribute] = group.options.map((o) => ({ value: slugify(o.name), label: o.name }));
  }
  const cheapest = [...p.variants].sort((a, b) => a.priceWithTax - b.priceWithTax)[0];
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: htmlToParagraphs(p.description).join(" "),
    image: p.featuredAsset?.preview ?? null,
    brand: p.customFields.brand,
    collectionSlugs: p.collections.map((c) => c.slug),
    priceFrom: cheapest ? { amount: cheapest.priceWithTax, currency: cheapest.currencyCode } : null,
    available: p.variants.some((v) => v.stockLevel !== "OUT_OF_STOCK"),
    attributes,
  };
};

export function createShopClient({ url, channelToken, cookie, onSetCookie }: ShopClientOptions) {
  async function request<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (channelToken) headers["vendure-token"] = channelToken;
    if (cookie) headers.cookie = cookie;
    const res = await fetch(url, {
      method: "POST",
      headers,
      credentials: "same-origin",
      body: JSON.stringify({ query, variables }),
    });
    const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    if (setCookies.length) onSetCookie?.(setCookies);
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

  const orderResult = (r: RawOrderResult): Cart => {
    if (r.__typename !== "Order" || !("lines" in r)) {
      throw new ShopApiError("message" in r ? r.message : "No se pudo actualizar el carrito");
    }
    return toCart(r);
  };

  return {
    async store(): Promise<Store> {
      const { activeChannel: c } = await request<{
        activeChannel: {
          token: string;
          defaultCurrencyCode: CurrencyCode;
          customFields: Record<string, string | null> & { logo: { preview: string } | null };
        };
      }>(STORE_QUERY);
      const f = c.customFields;
      return {
        token: c.token,
        name: f.storeName ?? c.token,
        currency: c.defaultCurrencyCode,
        designStyle: f.designStyle ?? "suave",
        primaryColor: f.primaryColor ?? null,
        font: f.font ?? "sistema",
        logo: f.logo?.preview ?? null,
        tagline: f.tagline ?? null,
        about: f.about ?? null,
        contactEmail: f.contactEmail ?? null,
        contactPhone: f.contactPhone ?? null,
        policies: {
          envios: f.shippingPolicy ?? null,
          devoluciones: f.returnsPolicy ?? null,
          privacidad: f.privacyPolicy ?? null,
        },
      };
    },

    async product(slug: string): Promise<Product | null> {
      const { product } = await request<{ product: RawProduct | null }>(PRODUCT_QUERY, { slug });
      if (!product) return null;
      const { description, variants, customFields, ...rest } = product;
      return {
        ...rest,
        descriptionHtml: description,
        brand: customFields.brand,
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

    /** Todo el catálogo publicado de la tienda, para listados y filtros. */
    async catalog(): Promise<CatalogProduct[]> {
      const all: CatalogProduct[] = [];
      for (let skip = 0; ; skip += 100) {
        const { products } = await request<{ products: { totalItems: number; items: RawCatalogProduct[] } }>(
          CATALOG_QUERY,
          { skip },
        );
        all.push(...products.items.map(toCatalogProduct));
        // ponytail: una tienda con miles de productos hace muchas vueltas; ahí conviene buscar en Meilisearch.
        if (all.length >= products.totalItems || products.items.length === 0) return all;
      }
    },

    async collections(): Promise<StoreCollection[]> {
      const { collections } = await request<{
        collections: { items: { name: string; slug: string; customFields: { marketplaceCategory: string | null } }[] };
      }>(COLLECTIONS_QUERY);
      return collections.items.map((c) => ({
        name: c.name,
        slug: c.slug,
        marketplaceCategory: c.customFields.marketplaceCategory,
      }));
    },

    /** Marcas aprobadas del catálogo de Spora, por slug. */
    async brandNames(): Promise<Map<string, string>> {
      const { brands } = await request<{ brands: { slug: string; name: string }[] }>(
        "query Brands { brands { slug name } }",
      );
      return new Map(brands.map((b) => [b.slug, b.name]));
    },

    async activeOrder(): Promise<Cart | null> {
      const { activeOrder } = await request<{ activeOrder: RawOrder | null }>(ACTIVE_ORDER_QUERY);
      return activeOrder ? toCart(activeOrder) : null;
    },

    async addItemToOrder(variantId: string, quantity = 1): Promise<Cart> {
      const { addItemToOrder } = await request<{ addItemToOrder: RawOrderResult }>(ADD_ITEM_MUTATION, {
        variantId,
        quantity,
      });
      return orderResult(addItemToOrder);
    },

    async adjustOrderLine(lineId: string, quantity: number): Promise<Cart> {
      const { adjustOrderLine } = await request<{ adjustOrderLine: RawOrderResult }>(ADJUST_LINE_MUTATION, {
        lineId,
        quantity,
      });
      return orderResult(adjustOrderLine);
    },

    async removeOrderLine(lineId: string): Promise<Cart> {
      const { removeOrderLine } = await request<{ removeOrderLine: RawOrderResult }>(REMOVE_LINE_MUTATION, {
        lineId,
      });
      return orderResult(removeOrderLine);
    },
  };
}

export type ShopClient = ReturnType<typeof createShopClient>;
