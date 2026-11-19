import { expect, test } from "vitest";
import { storeSlugFromHost } from "./store-host";

test("el subdominio decide la tienda", () => {
  expect(storeSlugFromHost("tienda-demo.spora.localhost:4000", "spora.localhost")).toBe("tienda-demo");
  expect(storeSlugFromHost("CAFE-SUR.Spora.cr", "spora.cr")).toBe("cafe-sur");
});

test("dominio raíz, www, otros dominios y subdominios anidados no son tiendas", () => {
  for (const host of [
    "spora.localhost:4000",
    "www.spora.localhost",
    "evil.com",
    "a.b.spora.localhost",
    "-x.spora.localhost",
  ]) {
    expect(storeSlugFromHost(host, "spora.localhost")).toBeNull();
  }
});
