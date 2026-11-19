import { expect, test } from "vitest";
import { businessDate, convertMoney, rateUnits } from "./exchange";
import { crCantons, crDistricts, crPlace, crProvinces } from "./nomenclator";

test("convierte con enteros y redondea al céntimo o centavo más cercano", () => {
  expect(convertMoney({ amount: 2500, currency: "USD" }, "CRC", "515.25")).toEqual({
    amount: 1288125,
    currency: "CRC",
  });
  expect(convertMoney({ amount: 1250000, currency: "CRC" }, "USD", "515.25")).toEqual({
    amount: 2426,
    currency: "USD",
  });
  // 0.1 + 0.2 no aparece: la tasa nunca pasa por un float en la multiplicación.
  expect(convertMoney({ amount: 1, currency: "USD" }, "CRC", "0.3")).toEqual({ amount: 0, currency: "CRC" });
  expect(convertMoney({ amount: 500, currency: "CRC" }, "CRC", "515.25")).toEqual({ amount: 500, currency: "CRC" });
});

test("rechaza tasas mal formadas", () => {
  expect(rateUnits("515")).toBe(5150000);
  expect(rateUnits("515.2512")).toBe(5152512);
  for (const bad of ["", "abc", "-5", "1,5", "515.12345", "0"]) expect(() => rateUnits(bad)).toThrow();
});

test("la fecha de negocio es la de Costa Rica (UTC−6)", () => {
  // 3 de enero a las 03:00 UTC todavía es 2 de enero en Costa Rica.
  expect(businessDate(new Date("2026-01-03T03:00:00Z"))).toBe("2026-01-02");
  expect(businessDate(new Date("2026-01-03T07:00:00Z"))).toBe("2026-01-03");
});

test("nomenclátor: 7 provincias, cantones y distritos encadenados por código", () => {
  expect(crProvinces()).toHaveLength(7);
  expect(crCantons("1").map((c) => c.name)).toContain("Escazú");
  expect(crDistricts("101").map((d) => d.postalCode)).toContain("10101");
  expect(crPlace("10201")).toMatchObject({
    district: { name: "Escazú", postalCode: "10201" },
    canton: { name: "Escazú" },
    province: { name: "San José" },
  });
  expect(crPlace("99999")).toBeNull();
});
