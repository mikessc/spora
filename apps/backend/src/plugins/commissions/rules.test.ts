// Casos borde de MVP.md (M6) con fechas fijas.
import assert from "node:assert/strict";
import { test } from "node:test";
import { agreementOn, billingMonth, commissionAmount, commissionBase, percentageBasisPoints } from "./rules";

test("cambio de porcentaje a mitad de mes: cada pedido usa el vigente el día en que se hizo", () => {
  const agreements = [
    { percentage: "10", validFrom: "2026-11-01" },
    { percentage: "8.5", validFrom: "2026-11-15" },
  ];
  assert.equal(agreementOn(agreements, "2026-11-14")?.percentage, "10");
  assert.equal(agreementOn(agreements, "2026-11-15")?.percentage, "8.5");
  assert.equal(agreementOn(agreements, "2026-10-31"), null);
  const base = { amount: 1000000, currency: "CRC" as const };
  assert.deepEqual(commissionAmount(base, "10"), { amount: 100000, currency: "CRC" });
  assert.deepEqual(commissionAmount(base, "8.5"), { amount: 85000, currency: "CRC" });
});

test("pedido de fin de mes entregado al mes siguiente: se factura en el mes de la entrega (hora de Costa Rica)", () => {
  // Entregado el 1 de diciembre a la 01:00 en Costa Rica (07:00 UTC) → diciembre.
  assert.equal(billingMonth(new Date("2026-12-01T07:00:00Z")), "2026-12");
  // 30 de noviembre a las 23:30 en Costa Rica es 1 de diciembre en UTC: sigue siendo noviembre.
  assert.equal(billingMonth(new Date("2026-12-01T05:30:00Z")), "2026-11");
});

test("pedido de una tienda en CRC pagado en USD (PayPal): la comisión es en dólares", () => {
  const base = commissionBase({ amount: 1400000, currency: "CRC" }, "USD", "515.00");
  assert.deepEqual(base, { amount: 2718, currency: "USD" }); // ₡14 000 ≈ $27,18
  assert.deepEqual(commissionAmount(base, "8"), { amount: 217, currency: "USD" });
  // Mismo pedido pagado en colones: base sin convertir.
  assert.deepEqual(commissionBase({ amount: 1400000, currency: "CRC" }, "CRC", "515.00"), {
    amount: 1400000,
    currency: "CRC",
  });
});

test("la base no lleva IVA: el subtotal sin impuesto (order.subTotal), no el que paga el cliente", () => {
  // ₡6 500 con IVA del 13 % → Vendure guarda subTotal = ₡5 752,21; al 8 % la comisión es ₡460,18 (no ₡520).
  const base = commissionBase({ amount: 575221, currency: "CRC" }, "CRC", null);
  assert.deepEqual(commissionAmount(base, "8"), { amount: 46018, currency: "CRC" });
});

test("porcentajes: hasta 2 decimales y no más de 100", () => {
  assert.equal(percentageBasisPoints("7.25"), 725);
  assert.equal(percentageBasisPoints("100"), 10_000);
  for (const bad of ["", "abc", "7,5", "101", "7.255", "-3"]) assert.throws(() => percentageBasisPoints(bad));
});
