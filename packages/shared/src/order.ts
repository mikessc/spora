import type { CurrencyCode, Money } from "./money";

/** Dirección de Costa Rica con el nomenclátor (ver nomenclator.ts). */
export interface Address {
  id?: string;
  fullName: string;
  phone: string;
  /** Señas: lo que el repartidor necesita para encontrar el lugar. */
  street: string;
  province: string;
  canton: string;
  district: string;
  /** Código del nomenclátor compartido con TrackingApp (`10201`). */
  districtCode: string;
  postalCode: string;
}

export interface Customer {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  addresses: Address[];
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

/** Un pedido: el carrito activo o uno ya hecho. */
export interface Cart {
  code: string;
  /** Estado de Vendure: AddingItems, ArrangingPayment, PaymentAuthorized, PaymentSettled, Shipped, Delivered… */
  state: string;
  lines: CartLine[];
  totalQuantity: number;
  subTotal: Money;
  shipping: Money;
  total: Money;
  currency: CurrencyCode;
  /** Tipo de cambio guardado al pasar a pago (colones por dólar). */
  exchangeRate: string | null;
  placedAt: string | null;
  customer: { email: string; firstName: string; lastName: string } | null;
  shippingAddress: Address | null;
  shippingMethod: { id: string; name: string } | null;
  payments: { method: string; state: string; amount: Money }[];
}

export interface ShippingOption {
  id: string;
  name: string;
  description: string;
  price: Money;
}

export interface PaymentOption {
  code: string;
  name: string;
  description: string;
  eligible: boolean;
}

/** Un pedido en el historial de la Cuenta Spora (todas las tiendas). */
export interface OrderSummary {
  code: string;
  state: string;
  placedAt: string | null;
  total: Money;
  exchangeRate: string | null;
  storeName: string;
  storeToken: string;
}

/** Estados de Vendure en palabras del cliente. */
export const orderStateLabel = (state: string): string =>
  ({
    AddingItems: "En el carrito",
    ArrangingPayment: "Esperando el pago",
    PaymentAuthorized: "Confirmado",
    PaymentSettled: "Pagado",
    PartiallyShipped: "Enviado en parte",
    Shipped: "Enviado",
    PartiallyDelivered: "Entregado en parte",
    Delivered: "Entregado",
    Cancelled: "Cancelado",
  })[state] ?? state;
