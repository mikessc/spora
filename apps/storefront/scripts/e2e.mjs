// Recorrido de la tienda en Chrome real. Requiere `pnpm dev` (Vendure en 3000, storefront en 4000) y el seed.
//   pnpm e2e
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const STORE = process.env.STOREFRONT_URL ?? "http://tienda-demo.spora.localhost:4000";
const PRODUCT = `${STORE}/producto/camiseta-sibu`;
const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? "chrome" });
const viewport = { width: 1200, height: 900 };
const results = [];
// Intl separa miles con espacio duro (U+00A0 o U+202F según ICU).
const text = async (loc) => ((await loc.textContent()) ?? "").replace(/\s+/g, " ").trim();
const ok = (name) => results.push(`✔ ${name}`);
/** La casilla de un valor de filtro, por su nombre exacto (la etiqueta incluye el conteo). */
const filterOption = (page, name) =>
  page.locator(".filters__option", { has: page.locator(".filters__label", { hasText: new RegExp(`^${name}$`) }) });

/**
 * La hidratación no cambia nada visible. Foto del DOM al terminar el parseo (antes de los scripts defer); al final de
 * cada lote de mutaciones —como mucho una tarea, y el navegador no pinta a mitad de una tarea— el DOM debe ser
 * idéntico: mismos nodos (identidad), atributos (salvo marcadores data-sibu-*), texto y estado `checked`. Además, la
 * captura con JS debe ser idéntica píxel a píxel a la de sin JS.
 */
async function assertSeamlessHydration(url, islandCount, noJsShot) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript(() => {
    const view = (el) =>
      [...el.attributes]
        .filter((a) => !a.name.startsWith("data-sibu") && a.name !== "checked")
        .map((a) => `${a.name}=${a.value}`)
        .sort()
        .join(" ") + (el instanceof HTMLInputElement ? ` [checked=${el.checked}]` : "");
    document.addEventListener("readystatechange", () => {
      if (document.readyState !== "interactive") return;
      const root = document.body;
      const nodes = [...root.querySelectorAll("*")];
      const snapshot = new Map(nodes.map((el) => [el, view(el)]));
      const text = root.textContent;
      const report = (window.__hydration = { batches: 0, records: 0, diffs: [] });
      new MutationObserver((records) => {
        report.batches++;
        report.records += records.length;
        const now = [...root.querySelectorAll("*")];
        if (now.length !== nodes.length || now.some((el, i) => el !== nodes[i]))
          report.diffs.push(`lote ${report.batches}: cambiaron los nodos elemento`);
        for (const el of now) {
          const v = view(el);
          if (snapshot.has(el) && v !== snapshot.get(el))
            report.diffs.push(`lote ${report.batches}: <${el.tagName}> ${snapshot.get(el)} → ${v}`);
        }
        if (root.textContent !== text) report.diffs.push(`lote ${report.batches}: cambió el texto`);
      }).observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
    });
  });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(
    (n) => document.querySelectorAll("[data-sibu-island][data-sibu-enhanced]").length === n,
    islandCount,
  );
  await page.waitForTimeout(300);
  const hydration = await page.evaluate(() => window.__hydration);
  assert.deepEqual(hydration.diffs, [], `cambios visibles al hidratar ${url}:\n${hydration.diffs.join("\n")}`);
  assert.ok((await page.screenshot({ fullPage: true })).equals(noJsShot), `la captura con JS difiere: ${url}`);
  assert.deepEqual(errors, []);
  return { page, context, hydration };
}

try {
  const noJs = await browser.newContext({ javaScriptEnabled: false, viewport });
  const p1 = await noJs.newPage();

  // Dominio: una tienda inexistente o el dominio raíz dan 404 (desde el navegador: Node en Windows no resuelve
  // *.localhost).
  for (const url of ["http://no-existe.spora.localhost:4000/", "http://localhost:4000/"]) {
    assert.equal((await p1.goto(url))?.status(), 404, url);
  }
  ok("dominio: tienda inexistente y dominio raíz → 404");

  // Ficha sin JS: el HTML trae el producto completo.
  await p1.goto(PRODUCT, { waitUntil: "load" });
  assert.equal(await text(p1.locator("h1")), "Camiseta Sibú");
  assert.equal(await text(p1.locator(".variants__price")), "₡12 500");
  assert.equal(await text(p1.locator(".variants__stock")), "Disponible");
  assert.deepEqual(await p1.locator(".variants__label").allTextContents(), ["S", "M", "L", "Rojo", "Azul"]);
  assert.deepEqual(await p1.locator(".variants__radio:checked + .variants__label").allTextContents(), ["S", "Rojo"]);
  assert.equal(await p1.locator(".gallery__thumb img").count(), 4);
  assert.match((await p1.locator(".gallery__image").getAttribute("src")) ?? "", /rojo-frente/);
  assert.equal(await text(p1.locator(".add-to-cart__button")), "Agregar al carrito");
  assert.match(await text(p1.locator(".product-page__description")), /algodón peinado/);
  const productShot = await p1.screenshot({ fullPage: true });
  ok("ficha sin JS: nombre, precio, stock, opciones marcadas, 4 fotos, botón y descripción");

  // SEO de la ficha.
  const jsonLd = JSON.parse((await p1.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
  assert.equal(jsonLd["@type"], "Product");
  assert.equal(jsonLd.offers.length, 6);
  assert.deepEqual(jsonLd.brand, { "@type": "Brand", name: "Sibú" });
  assert.deepEqual(jsonLd.offers.map((o) => [o.sku, o.price, o.priceCurrency]).slice(0, 3), [
    ["CAM-S-ROJ", "12500.00", "CRC"],
    ["CAM-M-ROJ", "12500.00", "CRC"],
    ["CAM-L-ROJ", "13500.00", "CRC"],
  ]);
  assert.equal(await p1.locator('link[rel="canonical"]').getAttribute("href"), PRODUCT);
  assert.equal(await p1.title(), "Camiseta Sibú · Tienda Demo");
  const sitemap = await (await p1.goto(`${STORE}/sitemap.xml`))?.text();
  for (const path of ["/producto/gorra-sibu", "/categoria/accesorios", "/politicas/envios"]) {
    assert.ok(sitemap?.includes(`${STORE}${path}`), path);
  }
  ok("SEO: título, canónica, JSON-LD con 6 ofertas en CRC y sitemap con productos, categorías y políticas");

  // Hidratación de la ficha.
  const { page: p2, context: js, hydration } = await assertSeamlessHydration(PRODUCT, 4, productShot);
  ok(
    `hidratación de la ficha: 4 islas; ${hydration.records} mutaciones internas, ninguna visible; captura idéntica sin JS`,
  );

  // Islas de la ficha: se coordinan y el contador del encabezado sigue al carrito.
  const option = (name) => p2.locator(".variants__option").filter({ hasText: new RegExp(`^${name}$`) });
  await option("Azul").click();
  assert.match((await p2.locator(".gallery__image").getAttribute("src")) ?? "", /azul-frente/);
  await option("L").click();
  assert.equal(await text(p2.locator(".variants__price")), "₡13 500");
  assert.equal(await text(p2.locator(".variants__stock")), "Agotado");
  assert.ok(await p2.locator(".add-to-cart__button").isDisabled());
  await option("M").click();
  assert.ok(await p2.locator(".add-to-cart__button").isEnabled());
  await p2.locator(".gallery__thumb").nth(3).click();
  assert.match((await p2.locator(".gallery__image").getAttribute("src")) ?? "", /azul-espalda/);
  await p2.locator(".add-to-cart__button").click();
  await p2.locator(".add-to-cart__status", { hasText: "Agregado" }).waitFor();
  assert.equal(p2.url(), PRODUCT, "con JS no debe enviarse el formulario");
  assert.equal(await text(p2.locator(".store-header__count")), "1");
  await p2.locator(".add-to-cart__button").click();
  await p2.locator(".add-to-cart__status", { hasText: "2 artículo(s)" }).waitFor();
  assert.equal(await text(p2.locator(".store-header__count")), "2");
  await js.close();
  ok("islas: color → galería, talla → precio/stock/botón, miniaturas, carrito por la API y contador del encabezado");

  // Listado sin JS + hidratación sin cambios (islas de filtros y contador).
  await p1.goto(`${STORE}/`, { waitUntil: "load" });
  assert.equal(await text(p1.locator(".listing__count")), "3 productos");
  assert.match(await text(p1.locator(".store-hero")), /Ropa de algodón/);
  const homeShot = await p1.screenshot({ fullPage: true });
  const { page: p3, context: js3 } = await assertSeamlessHydration(`${STORE}/`, 2, homeShot);
  ok("portada: 3 productos sin JS; hidratación de filtros y contador sin cambios visibles");

  // Filtros: con JS se envían solos al marcar; sin JS con el botón.
  await filterOption(p3, "Negro").click();
  await p3.waitForURL(/color=negro/);
  assert.equal(await text(p3.locator(".listing__count")), "2 productos");
  await filterOption(p3, "S").click();
  await p3.waitForURL(/talla=s/);
  assert.deepEqual(await p3.locator(".product-card__name").allTextContents(), ["Camiseta Volcán"]);
  await js3.close();
  await p1.goto(`${STORE}/categoria/camisetas`);
  await filterOption(p1, "Rojo").click();
  await p1.locator(".filters__apply").click();
  await p1.waitForURL(/categoria\/camisetas\?color=rojo/);
  assert.deepEqual(await p1.locator(".product-card__name").allTextContents(), ["Camiseta Sibú"]);
  ok("filtros: con JS al marcar (Negro → 2, + talla S → Camiseta Volcán); sin JS con el botón, dentro de la categoría");

  // Búsqueda (ignora tildes) y políticas.
  await p1.goto(`${STORE}/buscar?q=VOLCAN`);
  assert.deepEqual(await p1.locator(".product-card__name").allTextContents(), ["Camiseta Volcán"]);
  assert.equal(await p1.locator('meta[name="robots"]').getAttribute("content"), "noindex");
  await p1.goto(`${STORE}/politicas/envios`);
  assert.match(await text(p1.locator(".policy__text")), /2 a 4 días hábiles/);
  ok("búsqueda sin tildes ni mayúsculas (noindex) y página de políticas");

  // Carrito completo sin JS: agregar desde la ficha, cambiar la cantidad y quitar.
  const cartNoJs = await browser.newContext({ javaScriptEnabled: false, viewport });
  const p4 = await cartNoJs.newPage();
  await p4.goto(`${STORE}/producto/camiseta-volcan`);
  await p4.locator(".variants__option").filter({ hasText: /^M$/ }).click();
  await p4.locator(".add-to-cart__button").click();
  await p4.waitForURL(`${STORE}/carrito`);
  assert.equal(await text(p4.locator(".cart__line a")), "Camiseta Volcán M Negro");
  assert.equal(await text(p4.locator(".store-header__count")), "1");
  await p4.locator(".cart__qty-input").fill("3");
  await p4.locator(".cart__update").click();
  assert.equal(await text(p4.locator(".cart__total-amount")), "₡42 000");
  await p4.goto(`${STORE}/producto/camiseta-volcan`);
  await p4
    .locator(".variants__option")
    .filter({ hasText: /^Verde$/ })
    .click();
  await p4.locator(".variants__option").filter({ hasText: /^M$/ }).click();
  await p4.locator(".add-to-cart__button").click();
  await p4.waitForURL(/aviso=sin-stock/);
  assert.match(await text(p4.locator(".cart__notice")), /no está disponible/);
  await p4.locator(".cart__remove").click();
  assert.equal(await text(p4.locator(".cart__empty")), "Su carrito está vacío.");
  await cartNoJs.close();
  ok("carrito sin JS: agregar M Negro, cantidad 3 (₡42 000), aviso de agotado (Verde M) y quitar");

  // Estilos: los 5 dan el mismo HTML de componentes y formas distintas.
  const shapes = new Map();
  let reference;
  for (const style of ["suave", "minimal", "vibrante", "editorial", "pop"]) {
    await p1.goto(`${PRODUCT}?estilo=${style}`);
    const html = await p1.locator(".store").evaluate((el) => el.outerHTML);
    reference ??= html;
    assert.equal(html, reference, `el HTML cambió con el estilo ${style}`);
    shapes.set(
      style,
      await p1.locator(".add-to-cart__button").evaluate((el) => {
        const s = getComputedStyle(el);
        return [s.borderTopLeftRadius, s.backgroundImage, s.backgroundColor, s.borderTopWidth, s.boxShadow].join("|");
      }),
    );
  }
  assert.equal(new Set(shapes.values()).size, 5, `formas repetidas: ${[...shapes].join("\n")}`);
  ok("estilos: suave, minimal, vibrante, editorial y pop con el mismo HTML y botones distintos");
} finally {
  await browser.close();
  console.log(results.join("\n"));
}
