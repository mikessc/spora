// Proveedores de pago (PLAN §4). La interfaz común es la de Vendure (`PaymentMethodHandler`); lo que el storefront
// necesita saber para seguir va en `metadata.public` con el mismo formato para todos (ver NextStep). Así, un proveedor
// nuevo es un handler más y el checkout no cambia.
import { LanguageCode, type Order, PaymentMethodHandler, type PaymentProcess } from "@vendure/core";
import { convertMoney, type CurrencyCode, formatMoney, type Money, type NextStep } from "@spora/shared";
import { gatewayFor } from "./gateways";

const es = (value: string) => [{ languageCode: LanguageCode.es, value }];
const secret = { ui: { component: "password-form-input" } };

/**
 * Lo que de verdad se cobra: la moneda la impone el método (SINPE → CRC, PayPal → USD). Se convierte con el tipo de
 * cambio que el pedido guardó al pasar a pago. El pago de Vendure queda en la moneda del pedido; el cobro real va en
 * `metadata.cobro` (las comisiones se facturan en la moneda en que entró el dinero, PLAN §5).
 */
export function chargeFor(order: Order, amount: number, currency: CurrencyCode | null) {
  const money: Money = { amount, currency: order.currencyCode as CurrencyCode };
  const rate = order.customFields.exchangeRate;
  if (!currency || currency === money.currency) return { ...money, exchangeRate: rate };
  if (!rate) throw new Error("El pedido no tiene tipo de cambio para convertir el cobro");
  return { ...convertMoney(money, currency, rate), exchangeRate: rate };
}

/** La URL de retorno la manda el storefront: solo se acepta hacia una tienda de Spora (evita redirecciones abiertas). */
export function checkReturnUrl(value: unknown): string {
  const base = process.env.STORE_BASE_DOMAIN ?? "spora.localhost";
  const url = new URL(String(value ?? ""));
  if (!/^https?:$/.test(url.protocol) || !url.hostname.endsWith(`.${base}`)) {
    throw new Error("URL de retorno no permitida");
  }
  return url.toString();
}

export const cashOnDeliveryHandler = new PaymentMethodHandler({
  code: "contra-entrega",
  description: es("Contra entrega"),
  args: {},
  createPayment: (_ctx, _order, amount) => ({
    amount,
    state: "Authorized" as const,
    metadata: {
      public: { paso: "listo", titulo: "Contra entrega", lineas: ["Pague al recibir su pedido."] } satisfies NextStep,
    },
  }),
  settlePayment: () => ({ success: true }),
});

export const sinpeHandler = new PaymentMethodHandler({
  code: "sinpe-movil",
  description: es("SINPE Móvil (el cliente sube el comprobante y la tienda confirma)"),
  args: {
    telefono: { type: "string", label: es("Número SINPE Móvil"), ...secret },
    titular: { type: "string", label: es("Nombre del titular") },
  },
  createPayment: (_ctx, order, amount, args) => {
    const cobro = chargeFor(order, amount, "CRC");
    return {
      amount,
      state: "Authorized" as const,
      metadata: {
        cobro,
        public: {
          paso: "instrucciones",
          titulo: "SINPE Móvil",
          lineas: [
            `Haga un SINPE Móvil por ${formatMoney(cobro)} al ${args.telefono} (${args.titular}).`,
            `En el detalle escriba el pedido ${order.code} y suba el comprobante aquí.`,
          ],
          comprobante: true,
        } satisfies NextStep,
      },
    };
  },
  settlePayment: () => ({ success: true }),
});

export const transferHandler = new PaymentMethodHandler({
  code: "transferencia",
  description: es("Transferencia bancaria (el cliente sube el comprobante y la tienda confirma)"),
  args: {
    banco: { type: "string", label: es("Banco") },
    titular: { type: "string", label: es("Titular de la cuenta") },
    cedula: { type: "string", label: es("Cédula del titular") },
    iban: { type: "string", label: es("IBAN"), ...secret },
    moneda: {
      type: "string",
      label: es("Moneda de la cuenta"),
      ui: { component: "select-form-input", options: [{ value: "CRC" }, { value: "USD" }] },
    },
  },
  createPayment: (_ctx, order, amount, args) => {
    const cobro = chargeFor(order, amount, args.moneda === "USD" ? "USD" : "CRC");
    return {
      amount,
      state: "Authorized" as const,
      metadata: {
        cobro,
        public: {
          paso: "instrucciones",
          titulo: "Transferencia bancaria",
          lineas: [
            `Transfiera ${formatMoney(cobro)} a ${args.banco}, cuenta IBAN ${args.iban}.`,
            `Titular: ${args.titular} (cédula ${args.cedula}). Detalle: pedido ${order.code}.`,
            "Suba el comprobante aquí cuando la haga.",
          ],
          comprobante: true,
        } satisfies NextStep,
      },
    };
  },
  settlePayment: () => ({ success: true }),
});

/**
 * Estado propio de un pago que espera a la pasarela: el pedido sigue en ArrangingPayment (no cuenta como pagado) hasta
 * que la pasarela confirma (completeExternalPayment → Settled) o rechaza (→ Declined).
 */
export const awaitingGatewayProcess: PaymentProcess<"EnPasarela"> = {
  transitions: {
    Created: { to: ["EnPasarela"], mergeStrategy: "merge" },
    EnPasarela: { to: ["Settled", "Declined", "Cancelled", "Error"] },
  },
};

declare module "@vendure/core/dist/service/helpers/payment-state-machine/payment-state" {
  interface CustomPaymentStates {
    EnPasarela: never;
  }
}

/** Pasarelas con redirección: el pago queda `EnPasarela` y se liquida cuando la pasarela confirma. */
function gatewayHandler(provider: "paypal" | "tilopay", title: string, currency: CurrencyCode | null, args: object) {
  return new PaymentMethodHandler({
    code: provider,
    description: es(`${title} (redirige a la pasarela)`),
    args: args as Record<string, never>,
    createPayment: async (_ctx, order, amount, methodArgs, metadata) => {
      const cobro = chargeFor(order, amount, currency);
      const address = order.shippingAddress;
      const { url, reference } = await gatewayFor(provider).create(
        {
          orderCode: order.code,
          amount: cobro.amount,
          currency: cobro.currency,
          returnUrl: checkReturnUrl(metadata.returnUrl),
          customer: {
            email: order.customer?.emailAddress ?? "",
            firstName: order.customer?.firstName ?? "",
            lastName: order.customer?.lastName ?? "",
            phone: order.customer?.phoneNumber ?? address?.phoneNumber ?? "",
          },
          address: address?.streetLine1
            ? {
                street: address.streetLine1,
                city: address.city ?? "",
                province: address.province ?? "",
                postalCode: address.postalCode ?? "",
              }
            : null,
        },
        methodArgs as Record<string, string>,
      );
      return {
        amount,
        state: "EnPasarela" as const,
        transactionId: reference,
        metadata: { cobro, public: { paso: "redirigir", titulo: title, url } satisfies NextStep },
      };
    },
    settlePayment: () => ({ success: true }),
  });
}

export const paypalHandler = gatewayHandler("paypal", "PayPal", "USD", {
  clientId: { type: "string", label: es("Client ID de PayPal") },
  clientSecret: { type: "string", label: es("Secret de PayPal"), ...secret },
  entorno: {
    type: "string",
    label: es("Entorno"),
    ui: { component: "select-form-input", options: [{ value: "sandbox" }, { value: "live" }] },
  },
});

export const tilopayHandler = gatewayHandler("tilopay", "Tarjeta (Tilopay)", null, {
  apiUser: { type: "string", label: es("API user de Tilopay") },
  password: { type: "string", label: es("API password de Tilopay"), ...secret },
  key: { type: "string", label: es("Llave (key) de Tilopay"), ...secret },
});

export const paymentHandlers = [cashOnDeliveryHandler, sinpeHandler, transferHandler, paypalHandler, tilopayHandler];
