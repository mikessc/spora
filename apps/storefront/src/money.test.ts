import { expect, test } from "vitest";
import { formatMoney } from "./money";

const plain = (s: string) => s.replace(/\s/g, " ");

test("formatea céntimos y centavos", () => {
  expect(plain(formatMoney({ amount: 1250000, currency: "CRC" }))).toBe("₡12 500");
  expect(plain(formatMoney({ amount: 1250050, currency: "CRC" }))).toBe("₡12 500,50");
  expect(plain(formatMoney({ amount: 2550, currency: "USD" }))).toMatch(/25,50/);
});
