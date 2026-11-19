export type CurrencyCode = "CRC" | "USD";
export const currencyCodes = ["CRC", "USD"] as const satisfies readonly CurrencyCode[];

/** Dinero en enteros de la unidad menor (céntimos/centavos), siempre con su moneda. */
export interface Money {
  amount: number;
  currency: CurrencyCode;
}

/** ₡12 500 o $25,50: sin decimales cuando el monto es redondo. */
export function formatMoney({ amount, currency }: Money): string {
  return new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency,
    minimumFractionDigits: amount % 100 === 0 ? 0 : 2,
  }).format(amount / 100);
}
