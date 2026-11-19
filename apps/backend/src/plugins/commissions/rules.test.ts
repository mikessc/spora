// Casos borde de MVP.md (M6) con fechas fijas.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  agreementOn,
  billableAtCloseFrom,
  billedAtClose,
  billingMonth,
  closingGraceDays,
  commissionAmount,
  commissionBase,
  percentageBasisPoints,
} from "./rules";

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

// Cierre de mes con días de gracia (correcciones post-MVP, 4b). Fechas fijas, hora de Costa Rica (UTC−6).
const pending = (iso: string) => ({ status: "pendiente", placedAt: new Date(iso) });
const closingOct31 = new Date("2026-10-31T23:00:00Z"); // 31 de octubre, 17:00 en CR

test("cierre: pedido del día 30 con cierre el 31 → pasa al mes siguiente", () => {
  const order = pending("2026-10-30T18:00:00Z"); // 30 de octubre, 12:00 en CR
  assert.equal(billedAtClose(order, "2026-10", closingOct31, 7), false);
  assert.equal(billableAtCloseFrom(order.placedAt, 7), "2026-11-06");
  // En el cierre de noviembre ya entra (sigue pendiente y tiene más de 7 días).
  assert.equal(billedAtClose(order, "2026-11", new Date("2026-11-30T23:00:00Z"), 7), true);
});

test("cierre: pedido de hace 10 días sin entregar → facturable al cierre (7 días justos también)", () => {
  assert.equal(billedAtClose(pending("2026-10-21T18:00:00Z"), "2026-10", closingOct31, 7), true); // 10 días
  assert.equal(billedAtClose(pending("2026-10-24T18:00:00Z"), "2026-10", closingOct31, 7), true); // 7 días
  assert.equal(billedAtClose(pending("2026-10-25T18:00:00Z"), "2026-10", closingOct31, 7), false); // 6 días
  // 25 de octubre a las 05:30 UTC es todavía el 24 en Costa Rica: cuenta como 7 días.
  assert.equal(billedAtClose(pending("2026-10-25T05:30:00Z"), "2026-10", closingOct31, 7), true);
  // Un pedido de noviembre no se factura al cerrar octubre, aunque el cierre se haga tarde.
  assert.equal(billedAtClose(pending("2026-11-01T18:00:00Z"), "2026-10", new Date("2026-11-20T18:00:00Z"), 7), false);
});

test("cierre: en disputa, anulado o ya facturable no entran por el cierre", () => {
  for (const status of ["en_disputa", "anulado", "facturable", "facturado"]) {
    assert.equal(
      billedAtClose({ status, placedAt: new Date("2026-10-01T18:00:00Z") }, "2026-10", closingOct31, 7),
      false,
      status,
    );
  }
});

test("días de gracia del cierre: SPORA_DIAS_GRACIA_CIERRE (7 por defecto)", () => {
  assert.equal(closingGraceDays({}), 7);
  assert.equal(closingGraceDays({ SPORA_DIAS_GRACIA_CIERRE: "3" }), 3);
  for (const bad of ["-1", "abc", "2.5"]) assert.throws(() => closingGraceDays({ SPORA_DIAS_GRACIA_CIERRE: bad }));
});
