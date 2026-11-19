import { expect, test } from "vitest";
import { canConfirmDelivery } from "./order";

test("¿Recibiste tu pedido?: enviados sin entregar y retiros ya hechos, una sola vez", () => {
  const ask = (state: string, pickup = false, report: "recibido" | "no-recibido" | null = null) =>
    canConfirmDelivery({ state, pickup, report });
  expect(ask("Shipped")).toBe(true);
  expect(ask("PaymentAuthorized", true)).toBe(true); // retiro en local
  expect(ask("PaymentAuthorized")).toBe(false); // envío que aún no sale
  expect(ask("Delivered")).toBe(false);
  expect(ask("Cancelled", true)).toBe(false);
  expect(ask("Shipped", false, "no-recibido")).toBe(false); // ya respondió: en disputa
});
