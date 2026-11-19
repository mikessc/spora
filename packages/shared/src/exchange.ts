// Tipo de cambio CRC/USD (ADR 0004). La tasa es "colones por dólar" (venta BCCR) con hasta 4 decimales, guardada como
// texto; las cuentas se hacen con enteros (diezmilésimas) para no arrastrar errores de punto flotante con dinero.
import type { CurrencyCode, Money } from "./money";

export interface ExchangeRate {
  /** Día de negocio en America/Costa_Rica, `YYYY-MM-DD`. */
  date: string;
  /** Colones por dólar, p. ej. `"515.25"`. */
  rate: string;
}

const SCALE = 10_000;

/** "515.25" → 5152500. Rechaza lo que no sea un número positivo con hasta 4 decimales. */
export function rateUnits(rate: string): number {
  const match = /^(\d+)(?:\.(\d{1,4}))?$/.exec(rate.trim());
  if (!match) throw new Error(`Tipo de cambio inválido: "${rate}"`);
  const units = Number(match[1]) * SCALE + Number((match[2] ?? "").padEnd(4, "0"));
  if (!units) throw new Error("El tipo de cambio no puede ser cero");
  return units;
}

/**
 * Convierte entre CRC y USD, en unidades menores y redondeando al entero más cercano.
 * 1 USD = `rate` CRC, así que 1 centavo = `rate` céntimos.
 */
export function convertMoney(money: Money, to: CurrencyCode, rate: string): Money {
  if (money.currency === to) return money;
  const units = rateUnits(rate);
  const amount =
    money.currency === "USD" ? Math.round((money.amount * units) / SCALE) : Math.round((money.amount * SCALE) / units);
  return { amount, currency: to };
}

export const otherCurrency = (currency: CurrencyCode): CurrencyCode => (currency === "CRC" ? "USD" : "CRC");

/** Fecha de negocio (`YYYY-MM-DD`) en Costa Rica, nunca la del servidor ni UTC (CLAUDE.md). */
export const businessDate = (at: Date = new Date()): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(at);

/** "19 nov 2026, 14:05" en hora de Costa Rica. */
export const formatDateTime = (iso: string): string =>
  new Intl.DateTimeFormat("es-CR", { timeZone: "America/Costa_Rica", dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso),
  );
