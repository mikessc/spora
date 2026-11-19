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

/** Lo que el cliente hace después de elegir cómo pagar (lo define cada proveedor de pago en el backend). */
export type NextStep =
  | { paso: "listo"; titulo: string; lineas: string[] }
  | { paso: "instrucciones"; titulo: string; lineas: string[]; comprobante: true }
  | { paso: "redirigir"; titulo: string; url: string };

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
  payments: { method: string; state: string; amount: Money; next: NextStep | null }[];
  /** Comprobante de pago subido por el cliente (SINPE o transferencia). */
  receipt: string | null;
  /** Guías de envío con su rastreo. */
  shipments: Shipment[];
}

export interface Shipment {
  /** Transportista: "TrackingApp", "Correos de Costa Rica", o lo que puso la tienda. */
  method: string;
  trackingCode: string;
  trackingUrl: string | null;
  /** Último estado que reportó el transportista. */
  status: string | null;
  /** Estado de Vendure: Pending, Shipped, Delivered, Cancelled. */
  state: string;
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

/** Lo que dijo el cliente sobre la entrega: la recibió, o no (el pedido queda en disputa). */
export type DeliveryReport = "recibido" | "no-recibido";

/**
 * ¿El pedido espera que el cliente confirme la entrega? Enviado y sin entregar, o de retiro en local y ya hecho; nunca
 * si el cliente ya respondió, ni entregado ni cancelado.
 */
export function canConfirmDelivery(order: { state: string; pickup: boolean; report: DeliveryReport | null }): boolean {
  if (order.report) return false;
  if (order.state === "Shipped" || order.state === "PartiallyShipped") return true;
  return order.pickup && (order.state === "PaymentAuthorized" || order.state === "PaymentSettled");
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
  shipment: Pick<Shipment, "method" | "trackingCode" | "trackingUrl" | "status"> | null;
  /** Muestra "¿Recibiste tu pedido?". */
  canConfirmDelivery: boolean;
  deliveryReport: DeliveryReport | null;
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
