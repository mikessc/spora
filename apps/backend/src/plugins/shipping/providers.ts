// Proveedores de envío (PLAN §8): cotizar → crear guía → recibir estados. Cotizar es un ShippingCalculator de Vendure;
// crear la guía, un FulfillmentHandler. Los estados llegan por webhooks (TrackingApp) o consultas (Correos) y entran
// todos por ShipmentEventsService. Adaptador real + simulado (MVP.md): el simulado es el de por defecto; el real se
// activa con SPORA_ENVIOS_REALES=trackingapp,correos.
import { randomUUID } from "node:crypto";
import {
  type Channel,
  FulfillmentHandler,
  LanguageCode,
  Logger,
  Order,
  type RequestContext,
  ShippingCalculator,
  TransactionalConnection,
} from "@vendure/core";
import { convertMoney, type CurrencyCode, slugify } from "@spora/shared";

const es = (value: string) => [{ languageCode: LanguageCode.es, value }];
/** Vendure solo dice "no se pudo crear la guía": se registra la causa antes de relanzarla. */
async function logged<T>(provider: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    Logger.error(`${provider}: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`, "Spora");
    throw err;
  }
}

export const realShipping = () => new Set((process.env.SPORA_ENVIOS_REALES ?? "").split(",").map((s) => s.trim()));

export const PROVINCES = ["San José", "Alajuela", "Cartago", "Heredia", "Guanacaste", "Puntarenas", "Limón"] as const;
const provinceArg = (province: string) => `tarifa_${slugify(province).replace(/-/g, "_")}`;

/** Envío propio: tarifa por provincia (la zona), en la moneda de la tienda. */
export const zoneRateCalculator = new ShippingCalculator({
  code: "tarifa-por-zona",
  description: es("Envío propio: tarifa por provincia"),
  args: Object.fromEntries(
    PROVINCES.map((p) => [provinceArg(p), { type: "int", label: es(p), ui: { component: "currency-form-input" } }]),
  ) as Record<string, { type: "int" }>,
  calculate: (_ctx, order, args) => {
    const rates = args as Record<string, number>;
    const province = order.shippingAddress?.province ?? "";
    // Sin dirección todavía se muestra la tarifa más alta (no sorprende al final).
    const price = PROVINCES.includes(province as (typeof PROVINCES)[number])
      ? rates[provinceArg(province)]
      : Math.max(...Object.values(rates));
    return { price: price ?? 0, priceIncludesTax: true, taxRate: 0 };
  },
});

export const zoneRateArgs = (rate: number) => PROVINCES.map((p) => ({ name: provinceArg(p), value: String(rate) }));

/** Peso del pedido en gramos (campo de la variante; 500 g si el comercio no lo puso). */
export const orderWeightGrams = (order: Order) =>
  order.lines.reduce((sum, line) => sum + (line.productVariant?.customFields?.weightGrams ?? 500) * line.quantity, 0);

// ── Correos de Costa Rica (Pymexpress) ───────────────────────────────────────────────────────────────────────────

const GAM = new Set(["San José", "Alajuela", "Cartago", "Heredia"]);

/**
 * Tarifa simulada de Pymexpress (aproximada a la pública): primer kilo según zona y cada kilo adicional. El Web Service
 * real lo da Correos a cada comercio (PLAN §8.2): con SPORA_ENVIOS_REALES=correos se pide la integración (pendiente).
 */
export function pymexpressQuote(weightGrams: number, province: string): number {
  const kilos = Math.max(1, Math.ceil(weightGrams / 1000));
  const first = GAM.has(province) ? 230000 : 290000;
  return first + (kilos - 1) * 65000;
}

export const correosCalculator = new ShippingCalculator({
  code: "correos-pymexpress",
  description: es("Correos de Costa Rica (Pymexpress): por peso y destino"),
  args: {},
  calculate: (_ctx, order) => {
    if (realShipping().has("correos")) throw new Error("Correos real: falta la integración con el Web Service");
    const crc = pymexpressQuote(orderWeightGrams(order), order.shippingAddress?.province ?? "");
    const rate = order.customFields.exchangeRate ?? process.env.BCCR_SIMULATED_RATE ?? "515.00";
    const price =
      order.currencyCode === "CRC"
        ? crc
        : convertMoney({ amount: crc, currency: "CRC" }, order.currencyCode as CurrencyCode, rate).amount;
    return { price, priceIncludesTax: true, taxRate: 0 };
  },
});

export const correosFulfillment = new FulfillmentHandler({
  code: "correos-pymexpress",
  description: es("Guía de Correos (Pymexpress)"),
  args: {},
  createFulfillment: () => {
    if (realShipping().has("correos")) throw new Error("Correos real: falta la integración con el Web Service");
    const guide = `PY${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}CR`;
    return {
      method: "Correos de Costa Rica",
      trackingCode: guide,
      customFields: { provider: "correos", externalId: guide, trackingUrl: null, trackingStatus: "Guía creada" },
    };
  },
});

// ── TrackingApp (PLAN §8.1) ──────────────────────────────────────────────────────────────────────────────────────

export interface TrackingAppShipment {
  externalRef: string;
  recipient: { fullName: string; phone: string; email: string | null; addressLine: string; notes: string | null };
  packages: { description: string; weightKg: number; codAmount: number | null }[];
}
export interface TrackingAppPackage {
  id: string;
  trackingNumber: string;
  publicCode: string;
  trackingUrl: string;
}

/** POST /v1/shipments con la llave de cliente de la tienda e `Idempotency-Key` por pedido. */
export async function createTrackingAppShipment(
  key: string,
  idempotencyKey: string,
  shipment: TrackingAppShipment,
): Promise<TrackingAppPackage> {
  if (!realShipping().has("trackingapp")) {
    const n = String(Math.floor(Math.random() * 1e6)).padStart(6, "0");
    return { id: randomUUID(), trackingNumber: `SIM-${n}`, publicCode: `sim${n}`, trackingUrl: "" };
  }
  if (!key) throw new Error("TrackingApp: la tienda no tiene llave de cliente");
  const base = process.env.TRACKINGAPP_API_URL ?? "http://localhost:8787/v1";
  const res = await fetch(`${base}/shipments`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "idempotency-key": idempotencyKey },
    body: JSON.stringify(shipment),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json()) as { packages?: TrackingAppPackage[]; error?: { message: string } };
  const pkg = body.packages?.[0];
  if (!res.ok || !pkg) throw new Error(`TrackingApp: ${body.error?.message ?? `respondió ${res.status}`}`);
  return pkg;
}

/** Texto de la dirección para TrackingApp (`addressLine`): señas, distrito, cantón, provincia y código postal. */
export function addressLine(order: Order): string {
  const a = order.shippingAddress;
  const district = (a?.customFields as { district?: string } | undefined)?.district;
  return [a?.streetLine1, district, a?.city, a?.province, a?.postalCode ? `CP ${a.postalCode}` : null]
    .filter(Boolean)
    .join(", ");
}

/** Contra entrega: lo que el mensajero cobra, en unidades mayores (TrackingApp no lleva moneda en `codAmount`). */
export function codAmount(order: Order): number | null {
  const cod = order.payments?.find((p) => p.method.endsWith("-contra-entrega") && p.state === "Authorized");
  if (!cod) return null;
  // ponytail: TrackingApp no define la moneda de codAmount (PLAN §8.1); en USD se manda en las notas, no aquí.
  return order.currencyCode === "CRC" ? cod.amount / 100 : null;
}

export const trackingAppFulfillment = new FulfillmentHandler({
  code: "trackingapp",
  description: es("Crear el envío en TrackingApp"),
  args: {},
  init: (injector) => {
    connection = injector.get(TransactionalConnection);
  },
  createFulfillment: (ctx, orders) =>
    logged("TrackingApp", async () => {
      // Vendure pasa el pedido sin sus líneas: se carga completo (peso, contra entrega, destinatario).
      const order = await connection.getRepository(ctx, Order).findOneOrFail({
        where: { id: orders[0]!.id },
        relations: { lines: { productVariant: true }, payments: true, customer: true },
      });
      return createTrackingAppFulfillment(ctx, order);
    }),
});

let connection: TransactionalConnection;

async function createTrackingAppFulfillment(ctx: RequestContext, order: Order) {
  const channel = ctx.channel as Channel;
  const cod = codAmount(order);
  const usdCod = order.currencyCode === "USD" && order.payments?.some((p) => p.method.endsWith("-contra-entrega"));
  const pkg = await createTrackingAppShipment(channel.customFields.trackingAppKey ?? "", `spora-order-${order.id}`, {
    externalRef: order.code,
    recipient: {
      fullName: order.shippingAddress?.fullName ?? `${order.customer?.firstName} ${order.customer?.lastName}`,
      phone: order.shippingAddress?.phoneNumber ?? order.customer?.phoneNumber ?? "",
      email: order.customer?.emailAddress ?? null,
      addressLine: addressLine(order),
      notes: usdCod ? `Cobrar contra entrega USD ${(order.totalWithTax / 100).toFixed(2)}` : null,
    },
    packages: [
      {
        description: `Pedido ${order.code} de ${channel.customFields.storeName ?? channel.code}`,
        weightKg: orderWeightGrams(order) / 1000,
        codAmount: cod,
      },
    ],
  });
  return {
    method: "TrackingApp",
    trackingCode: pkg.trackingNumber,
    customFields: {
      provider: "trackingapp",
      externalId: pkg.id,
      trackingUrl: pkg.trackingUrl || null,
      trackingStatus: "Registrado",
    },
  };
}
