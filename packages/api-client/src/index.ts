// Cliente de la Shop API de Vendure. Sin dependencias de SibuJS: funciona en el servidor y en el navegador.
import {
  type AttributeValue,
  type Cart,
  type CatalogProduct,
  type CommonAttribute,
  type CurrencyCode,
  htmlToParagraphs,
  isCommonAttribute,
  type Product,
  slugify,
  type StockLevel,
  type StoreCollection,
  type Address,
  type Customer,
  type ExchangeRate,
  type OrderSummary,
  type PaymentOption,
  type ShippingOption,
} from "@spora/shared";
import {
  CUSTOMER_QUERY,
  ORDER,
  ORDER_RESULT,
  type RawCustomer,
  type RawOrder,
  type RawOrderResult,
  SPORA_ORDERS_QUERY,
  toAddressInput,
  toCart,
  toCustomer,
  toOrderSummary,
} from "./order";

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
        customFields {
          otherCurrencyPrice
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
          marketplaceCategory
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

const ACTIVE_ORDER_QUERY = `query ActiveOrder { activeOrder { ${ORDER} } }`;

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
  customFields: { otherCurrencyPrice: number | null };
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
  customFields: { brand: string | null; marketplaceCategory: string | null };
  featuredAsset: { preview: string } | null;
  collections: { slug: string }[];
  optionGroups: { customFields: { attribute: string | null }; options: { id: string; name: string }[] }[];
  variants: { priceWithTax: number; currencyCode: CurrencyCode; stockLevel: StockLevel }[];
}
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
    category: p.customFields.marketplaceCategory,
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
          otherCurrencyPrice: v.customFields.otherCurrencyPrice,
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

    // ── Cuenta Spora ──────────────────────────────────────────────────────────────────────────────────────────
    async customer(): Promise<Customer | null> {
      const { sporaCustomer } = await request<{ sporaCustomer: RawCustomer | null }>(CUSTOMER_QUERY);
      return sporaCustomer ? toCustomer(sporaCustomer) : null;
    },

    /** Inicia sesión; lanza `ShopApiError` con el código de Vendure (INVALID_CREDENTIALS_ERROR…) si falla. */
    async login(email: string, password: string): Promise<void> {
      const { login } = await request<{ login: { __typename: string; errorCode?: string; message?: string } }>(
        `mutation Login($email: String!, $password: String!) {
          login(username: $email, password: $password, rememberMe: true) {
            __typename
            ... on ErrorResult { errorCode message }
          }
        }`,
        { email, password },
      );
      if (login.__typename !== "CurrentUser") {
        throw new ShopApiError(login.message ?? "No se pudo ingresar", login.errorCode);
      }
    },

    async register(input: { firstName: string; lastName: string; email: string; phone: string; password: string }) {
      const { registerCustomerAccount: r } = await request<{
        registerCustomerAccount: { __typename: string; errorCode?: string; message?: string };
      }>(
        `mutation Register($input: RegisterCustomerInput!) {
          registerCustomerAccount(input: $input) {
            __typename
            ... on ErrorResult { errorCode message }
          }
        }`,
        {
          input: {
            firstName: input.firstName,
            lastName: input.lastName,
            emailAddress: input.email,
            phoneNumber: input.phone,
            password: input.password,
          },
        },
      );
      if (r.__typename !== "Success") throw new ShopApiError(r.message ?? "No se pudo crear la cuenta", r.errorCode);
    },

    async logout(): Promise<void> {
      await request("mutation Logout { logout { success } }");
    },

    /** Pedidos del cliente en todas las tiendas, del más reciente al más viejo. */
    async orders(): Promise<OrderSummary[]> {
      const { sporaOrders } = await request<{ sporaOrders: Parameters<typeof toOrderSummary>[0][] }>(
        SPORA_ORDERS_QUERY,
      );
      return sporaOrders.map(toOrderSummary);
    },

    /** El cliente dice si recibió su pedido (solo el dueño). Sí: queda entregado. No: queda en disputa. */
    async reportDelivery(orderCode: string, received: boolean): Promise<void> {
      await request(
        "mutation ReportDelivery($code: String!, $received: Boolean!) { reportOrderDelivery(orderCode: $code, received: $received) }",
        {
          code: orderCode,
          received,
        },
      );
    },

    async saveAddress(address: Address): Promise<void> {
      await request("mutation SaveAddress($input: CreateAddressInput!) { sporaCreateAddress(input: $input) { id } }", {
        input: toAddressInput(address),
      });
    },

    async exchangeRate(): Promise<ExchangeRate> {
      const { exchangeRate } = await request<{ exchangeRate: ExchangeRate }>(
        "query Rate { exchangeRate { date rate } }",
      );
      return exchangeRate;
    },

    // ── Checkout: datos → envío → pago ────────────────────────────────────────────────────────────────────────
    /** Comprador sin cuenta: datos de contacto del pedido. */
    async setGuest(input: { email: string; firstName: string; lastName: string; phone: string }): Promise<void> {
      const { setCustomerForOrder: r } = await request<{ setCustomerForOrder: RawOrderResult }>(
        `mutation Guest($input: CreateCustomerInput!) { setCustomerForOrder(input: $input) { ${ORDER_RESULT} } }`,
        {
          input: {
            emailAddress: input.email,
            firstName: input.firstName,
            lastName: input.lastName,
            phoneNumber: input.phone,
          },
        },
      );
      orderResult(r);
    },

    async setShippingAddress(address: Address): Promise<Cart> {
      const { setOrderShippingAddress: r } = await request<{ setOrderShippingAddress: RawOrderResult }>(
        `mutation Ship($input: CreateAddressInput!) { setOrderShippingAddress(input: $input) { ${ORDER_RESULT} } }`,
        { input: toAddressInput(address) },
      );
      return orderResult(r);
    },

    async shippingOptions(): Promise<ShippingOption[]> {
      const { eligibleShippingMethods, activeOrder } = await request<{
        eligibleShippingMethods: { id: string; name: string; description: string; priceWithTax: number }[];
        activeOrder: { currencyCode: CurrencyCode } | null;
      }>(
        "query ShippingOptions { eligibleShippingMethods { id name description priceWithTax } activeOrder { currencyCode } }",
      );
      const currency = activeOrder?.currencyCode ?? "CRC";
      return eligibleShippingMethods.map((m) => ({
        id: m.id,
        name: m.name,
        description: m.description,
        price: { amount: m.priceWithTax, currency },
      }));
    },

    async setShippingMethod(id: string): Promise<Cart> {
      const { setOrderShippingMethod: r } = await request<{ setOrderShippingMethod: RawOrderResult }>(
        `mutation ShipMethod($id: [ID!]!) { setOrderShippingMethod(shippingMethodId: $id) { ${ORDER_RESULT} } }`,
        { id: [id] },
      );
      return orderResult(r);
    },

    async paymentOptions(): Promise<PaymentOption[]> {
      const { eligiblePaymentMethods } = await request<{
        eligiblePaymentMethods: { code: string; name: string; description: string; isEligible: boolean }[];
      }>("query PaymentOptions { eligiblePaymentMethods { code name description isEligible } }");
      return eligiblePaymentMethods.map((m) => ({
        code: m.code,
        name: m.name,
        description: m.description,
        eligible: m.isEligible,
      }));
    },

    /** Pasa el pedido a pago (ahí se guarda el tipo de cambio del día) y agrega el pago con el método elegido. */
    async pay(method: string, metadata: Record<string, unknown> = {}): Promise<Cart> {
      const { activeOrder } = await request<{ activeOrder: { state: string } | null }>(
        "query State { activeOrder { state } }",
      );
      if (activeOrder?.state === "AddingItems") {
        const { transitionOrderToState: t } = await request<{
          transitionOrderToState: {
            __typename: string;
            errorCode?: string;
            message?: string;
            transitionError?: string;
          };
        }>(
          `mutation ToPayment { transitionOrderToState(state: "ArrangingPayment") {
            __typename
            ... on OrderStateTransitionError { errorCode message transitionError }
          } }`,
        );
        if (t.__typename !== "Order") throw new ShopApiError(t.transitionError ?? t.message ?? "", t.errorCode);
      }
      const { addPaymentToOrder: r } = await request<{ addPaymentToOrder: RawOrderResult }>(
        `mutation Pay($input: PaymentInput!) { addPaymentToOrder(input: $input) { ${ORDER_RESULT} } }`,
        { input: { method, metadata } },
      );
      return orderResult(r);
    },

    /** Un pedido de esta tienda por su código (el cliente dueño, o la misma sesión por un rato si fue sin cuenta). */
    async orderByCode(code: string): Promise<Cart | null> {
      try {
        const { orderByCode } = await request<{ orderByCode: RawOrder | null }>(
          `query OrderByCode($code: String!) { orderByCode(code: $code) { ${ORDER} } }`,
          { code },
        );
        return orderByCode ? toCart(orderByCode) : null;
      } catch (err) {
        if (err instanceof ShopApiError && err.code === "FORBIDDEN") return null;
        throw err;
      }
    },

    // ── Pagos (M4) ────────────────────────────────────────────────────────────────────────────────────────────────
    /** Vuelta de una pasarela (PayPal, Tilopay): el backend confirma con ella y liquida. Se puede repetir. */
    async completeExternalPayment(orderCode: string, params: Record<string, string>): Promise<Cart> {
      const { completeExternalPayment } = await request<{ completeExternalPayment: RawOrder }>(
        `mutation Complete($code: String!, $params: JSON!) {
          completeExternalPayment(orderCode: $code, params: $params) { ${ORDER} }
        }`,
        { code: orderCode, params },
      );
      return toCart(completeExternalPayment);
    },

    /** Comprobante de SINPE Móvil o transferencia (imagen o PDF de hasta 5 MB). */
    async submitReceipt(orderCode: string, file: { name: string; type: string; base64: string }): Promise<void> {
      await request(
        `mutation Receipt($code: String!, $input: PaymentReceiptInput!) {
          submitPaymentReceipt(orderCode: $code, input: $input)
        }`,
        { code: orderCode, input: file },
      );
    },
  };
}

export type ShopClient = ReturnType<typeof createShopClient>;
