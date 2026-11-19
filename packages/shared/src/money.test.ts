import { expect, test } from "vitest";
import { formatMoney, slugify } from "./index";

const plain = (s: string) => s.replace(/\s/g, " ");

test("formatea céntimos y centavos", () => {
  expect(plain(formatMoney({ amount: 1250000, currency: "CRC" }))).toBe("₡12 500");
  expect(plain(formatMoney({ amount: 1250050, currency: "CRC" }))).toBe("₡12 500,50");
  expect(plain(formatMoney({ amount: 2550, currency: "USD" }))).toBe("$25,50");
});

test("slugify normaliza tildes, mayúsculas y símbolos", () => {
  expect(slugify("Camisetas & Polos")).toBe("camisetas-polos");
  expect(slugify("  Café de Tarrazú ")).toBe("cafe-de-tarrazu");
  expect(slugify("Ñandú")).toBe("nandu");
});
