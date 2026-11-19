import { expect, test } from "vitest";
import { safeReturnPath, shareSessionCookie } from "./session-cookie";

test("la sesión se comparte con el dominio base; otras cookies no se tocan", () => {
  expect(shareSessionCookie("spora-sesion=abc; path=/; httponly", "spora.localhost")).toBe(
    "spora-sesion=abc; path=/; httponly; Domain=spora.localhost",
  );
  expect(shareSessionCookie("spora-sesion.sig=x; path=/", "spora.localhost")).toContain("Domain=spora.localhost");
  expect(shareSessionCookie("otra=1; path=/", "spora.localhost")).toBe("otra=1; path=/");
  expect(shareSessionCookie("spora-sesion=a; Domain=x.cr", "spora.localhost")).toBe("spora-sesion=a; Domain=x.cr");
});

test("solo se vuelve a rutas locales", () => {
  expect(safeReturnPath("/checkout/datos")).toBe("/checkout/datos");
  for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "", null]) {
    expect(safeReturnPath(bad, "/cuenta")).toBe("/cuenta");
  }
});
