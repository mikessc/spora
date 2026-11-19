// Reglas de comisión (PLAN §5, ADR 0003), sin base de datos: así los casos borde se prueban con fechas fijas.
import { businessDate, convertMoney, type CurrencyCode, type Money } from "@spora/shared";

/** "7.5" → 750 puntos básicos. Hasta 2 decimales, entre 0 y 100. */
export function percentageBasisPoints(percentage: string): number {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(percentage.trim());
  const bp = match ? Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0")) : NaN;
  if (!Number.isInteger(bp) || bp > 10_000) throw new Error(`Porcentaje inválido: "${percentage}"`);
  return bp;
}

export interface Agreement {
  percentage: string;
  /** Día de negocio desde el que rige (`YYYY-MM-DD`). */
  validFrom: string;
}

/** El acuerdo vigente en un día: el de `validFrom` más reciente que no sea posterior a ese día. */
export function agreementOn(agreements: Agreement[], day: string): Agreement | null {
  return agreements.filter((a) => a.validFrom <= day).sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1))[0] ?? null;
}

/** Mes de facturación (`YYYY-MM`) de un instante, en hora de Costa Rica. */
export const billingMonth = (at: Date): string => businessDate(at).slice(0, 7);

/**
 * La base de la comisión: el subtotal de productos **sin IVA ni envío** (`order.subTotal`; el IVA es de Hacienda, no
 * del comercio), en la moneda en que **entró el dinero**. Un pedido en
 * colones pagado por PayPal cuenta en dólares, convertido con el tipo de cambio que guardó el pedido.
 */
export function commissionBase(subTotal: Money, chargedIn: CurrencyCode, rate: string | null): Money {
  if (subTotal.currency === chargedIn) return subTotal;
  if (!rate) throw new Error("Falta el tipo de cambio del pedido para convertir la base");
  return convertMoney(subTotal, chargedIn, rate);
}

/** Días de gracia del cierre de mes (`SPORA_DIAS_GRACIA_CIERRE`, 7 por defecto). */
export function closingGraceDays(env: Record<string, string | undefined> = process.env): number {
  const days = Number(env.SPORA_DIAS_GRACIA_CIERRE ?? "7");
  if (!Number.isInteger(days) || days < 0)
    throw new Error(`SPORA_DIAS_GRACIA_CIERRE inválido: "${env.SPORA_DIAS_GRACIA_CIERRE}"`);
  return days;
}

const addDays = (day: string, days: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Día de negocio (hora de CR) desde el que un pedido sin entrega confirmada se factura al cerrar el mes. */
export const billableAtCloseFrom = (placedAt: Date, graceDays: number): string =>
  addDays(businessDate(placedAt), graceDays);

/**
 * ¿Se factura este movimiento al cerrar `month` el día `closingAt`, aunque nadie haya confirmado la entrega? Solo los
 * pendientes (no los cancelados ni los en disputa), hechos en ese mes o antes y con al menos `graceDays` días al
 * cierre (hora de CR). Los más nuevos esperan al cierre siguiente.
 */
export function billedAtClose(
  entry: { status: string; placedAt: Date },
  month: string,
  closingAt: Date,
  graceDays: number,
): boolean {
  return (
    entry.status === "pendiente" &&
    billingMonth(entry.placedAt) <= month &&
    billableAtCloseFrom(entry.placedAt, graceDays) <= businessDate(closingAt)
  );
}

/** Monto de la comisión en la unidad menor, redondeado al entero más cercano. */
export const commissionAmount = (base: Money, percentage: string): Money => ({
  amount: Math.round((base.amount * percentageBasisPoints(percentage)) / 10_000),
  currency: base.currency,
});
