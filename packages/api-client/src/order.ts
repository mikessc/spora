// Pedido, cuenta y checkout: consultas GraphQL y su traducción a los tipos de @spora/shared.
import type { Address, Cart, CurrencyCode, Customer, Money, NextStep, OrderSummary } from "@spora/shared";

const ADDRESS = /* GraphQL */ `
  fullName
  phoneNumber
  streetLine1
  city
  province
  postalCode
  customFields {
    district
    districtCode
  }
`;

export const ORDER = /* GraphQL */ `
  code
  state
  orderPlacedAt
  totalQuantity
  subTotalWithTax
  shippingWithTax
  totalWithTax
  currencyCode
  customFields {
    exchangeRate
    paymentReceipt {
      preview
    }
  }
  customer {
    emailAddress
    firstName
    lastName
  }
  shippingAddress { ${ADDRESS} }
  shippingLines {
    shippingMethod {
      id
      name
    }
  }
  payments {
    id
    method
    state
    amount
    metadata
  }
  fulfillments {
    method
    trackingCode
    state
    customFields {
      trackingUrl
      trackingStatus
    }
  }
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

export const ORDER_RESULT = `
  __typename
  ... on Order { ${ORDER} }
  ... on ErrorResult {
    errorCode
    message
  }
`;

interface RawAddress {
  id?: string;
  fullName: string | null;
  phoneNumber: string | null;
  streetLine1: string;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  customFields: { district: string | null; districtCode: string | null } | null;
}

export interface RawOrder {
  code: string;
  state: string;
  orderPlacedAt: string | null;
  totalQuantity: number;
  subTotalWithTax: number;
  shippingWithTax: number;
  totalWithTax: number;
  currencyCode: CurrencyCode;
  customFields: { exchangeRate: string | null; paymentReceipt: { preview: string } | null } | null;
  customer: { emailAddress: string; firstName: string; lastName: string } | null;
  shippingAddress: RawAddress | null;
  shippingLines: { shippingMethod: { id: string; name: string } }[];
  payments: { method: string; state: string; amount: number; metadata: { public?: NextStep } | null }[] | null;
  fulfillments:
    | {
        method: string;
        trackingCode: string;
        state: string;
        customFields: { trackingUrl: string | null; trackingStatus: string | null } | null;
      }[]
    | null;
  lines: {
    id: string;
    quantity: number;
    unitPriceWithTax: number;
    linePriceWithTax: number;
    featuredAsset: { preview: string } | null;
    productVariant: { name: string; product: { name: string; slug: string } };
  }[];
}
export type RawOrderResult =
  ({ __typename: "Order" } & RawOrder) | { __typename: string; errorCode: string; message: string };

const toAddress = (a: RawAddress | null): Address | null =>
  a?.customFields?.districtCode
    ? {
        id: a.id,
        fullName: a.fullName ?? "",
        phone: a.phoneNumber ?? "",
        street: a.streetLine1,
        province: a.province ?? "",
        canton: a.city ?? "",
        district: a.customFields.district ?? "",
        districtCode: a.customFields.districtCode,
        postalCode: a.postalCode ?? "",
      }
    : null;

/** Dirección de Spora → `CreateAddressInput` de Vendure (provincia, cantón en `city`, distrito en custom fields). */
export const toAddressInput = (a: Address) => ({
  fullName: a.fullName,
  phoneNumber: a.phone,
  streetLine1: a.street,
  city: a.canton,
  province: a.province,
  postalCode: a.postalCode,
  countryCode: "CR",
  customFields: { district: a.district, districtCode: a.districtCode },
});

export const toCart = (o: RawOrder): Cart => {
  const money = (amount: number): Money => ({ amount, currency: o.currencyCode });
  return {
    code: o.code,
    state: o.state,
    placedAt: o.orderPlacedAt,
    totalQuantity: o.totalQuantity,
    subTotal: money(o.subTotalWithTax),
    shipping: money(o.shippingWithTax),
    total: money(o.totalWithTax),
    currency: o.currencyCode,
    exchangeRate: o.customFields?.exchangeRate ?? null,
    customer: o.customer
      ? { email: o.customer.emailAddress, firstName: o.customer.firstName, lastName: o.customer.lastName }
      : null,
    shippingAddress: toAddress(o.shippingAddress),
    shippingMethod: o.shippingLines[0]?.shippingMethod ?? null,
    payments: (o.payments ?? []).map((p) => ({
      method: p.method,
      state: p.state,
      amount: money(p.amount),
      // La Shop API expone solo `metadata.public` de cada pago: ahí va el siguiente paso.
      next: p.metadata?.public?.paso ? p.metadata.public : null,
    })),
    receipt: o.customFields?.paymentReceipt?.preview ?? null,
    shipments: (o.fulfillments ?? []).map((f) => ({
      method: f.method,
      trackingCode: f.trackingCode,
      trackingUrl: f.customFields?.trackingUrl ?? null,
      status: f.customFields?.trackingStatus ?? null,
      state: f.state,
    })),
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

// sporaCustomer y no activeCustomer: Vendure solo ve al cliente en las tiendas donde ya compró.
export const CUSTOMER_QUERY = `query Customer {
  sporaCustomer {
    firstName
    lastName
    emailAddress
    phoneNumber
    addresses { id ${ADDRESS} }
  }
}`;

export interface RawCustomer {
  firstName: string;
  lastName: string;
  emailAddress: string;
  phoneNumber: string | null;
  addresses: RawAddress[];
}

export const toCustomer = (c: RawCustomer): Customer => ({
  firstName: c.firstName,
  lastName: c.lastName,
  email: c.emailAddress,
  phone: c.phoneNumber,
  addresses: c.addresses.map(toAddress).filter((a): a is Address => a !== null),
});

export const SPORA_ORDERS_QUERY = `query SporaOrders {
  sporaOrders {
    code state orderPlacedAt total currencyCode exchangeRate storeName storeToken
    shipment { method trackingCode trackingUrl status }
    canConfirmDelivery deliveryReport
  }
}`;

export const toOrderSummary = (o: {
  code: string;
  state: string;
  orderPlacedAt: string | null;
  total: number;
  currencyCode: CurrencyCode;
  exchangeRate: string | null;
  storeName: string;
  storeToken: string;
  shipment: OrderSummary["shipment"];
  canConfirmDelivery: boolean;
  deliveryReport: OrderSummary["deliveryReport"];
}): OrderSummary => ({
  code: o.code,
  state: o.state,
  placedAt: o.orderPlacedAt,
  total: { amount: o.total, currency: o.currencyCode },
  exchangeRate: o.exchangeRate,
  storeName: o.storeName,
  storeToken: o.storeToken,
  shipment: o.shipment,
  canConfirmDelivery: o.canConfirmDelivery,
  deliveryReport: o.deliveryReport,
});
