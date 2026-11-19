// Verifica los criterios de la Fase 0 con Chrome real. Requiere Vendure (3000) y el storefront (4000) corriendo.
//   pnpm e2e
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const BASE = process.env.STOREFRONT_URL ?? "http://tienda-demo.spora.localhost:4000";
const URL = `${BASE}/producto/camiseta-sibu`;
const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? "chrome" });
const viewport = { width: 1200, height: 900 };
const results = [];
// Intl separa miles con espacio duro (U+00A0 o U+202F según ICU).
const text = async (loc) => ((await loc.textContent()) ?? "").replace(/\s/g, " ");
const ok = (name) => results.push(`✔ ${name}`);

try {
  const noJs = await browser.newContext({ javaScriptEnabled: false, viewport });

  // 0. El dominio decide la tienda: una tienda inexistente o el dominio raíz dan 404. (Desde el navegador: Node en
  // Windows no resuelve *.localhost.)
  const p0 = await noJs.newPage();
  for (const url of [
    "http://no-existe.spora.localhost:4000/producto/camiseta-sibu",
    "http://localhost:4000/producto/x",
  ]) {
    assert.equal((await p0.goto(url))?.status(), 404, url);
  }
  await p0.close();
  ok("dominio: tienda inexistente y dominio raíz → 404");

  // 1. Sin JS el HTML trae el producto completo.
  const p1 = await noJs.newPage();
  await p1.goto(URL, { waitUntil: "load" });
  assert.equal(await p1.locator("h1").textContent(), "Camiseta Sibú");
  assert.equal(await text(p1.locator(".variants__price")), "₡12 500");
  assert.equal(await p1.locator(".variants__stock").textContent(), "Disponible");
  assert.deepEqual(await p1.locator(".variants__label").allTextContents(), ["S", "M", "L", "Rojo", "Azul"]);
  assert.deepEqual(await p1.locator(".variants__radio:checked + .variants__label").allTextContents(), ["S", "Rojo"]);
  assert.equal(await p1.locator(".gallery__thumb img").count(), 4);
  assert.match((await p1.locator(".gallery__image").getAttribute("src")) ?? "", /rojo-frente/);
  assert.equal((await p1.locator(".add-to-cart__button").textContent())?.trim(), "Agregar al carrito");
  assert.match((await p1.locator(".product-page__description").textContent()) ?? "", /algodón peinado/);
  const before = await p1.screenshot({ fullPage: true });
  ok("sin JS: nombre, precio, stock, 5 opciones (S y Rojo marcadas), 4 fotos, botón y descripción");

  // 2. La hidratación no parpadea: mismo píxel antes y después, y ningún nodo elemento creado/quitado.
  const js = await browser.newContext({ viewport });
  const p2 = await js.newPage();
  const consoleErrors = [];
  p2.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  p2.on("pageerror", (e) => consoleErrors.push(String(e)));
  await p2.addInitScript(() => {
    // Foto del DOM al terminar el parseo (antes de los scripts defer). Al final de cada lote de mutaciones
    // —como mucho una tarea, y el navegador no pinta a mitad de una tarea— el DOM visible debe ser idéntico:
    // mismos nodos (identidad), mismos atributos (salvo marcadores data-sibu-*), mismo texto, mismos checked.
    // `checked` se compara como estado: el atributo es solo el valor por defecto del control.
    const view = (el) =>
      [...el.attributes]
        .filter((a) => !a.name.startsWith("data-sibu") && a.name !== "checked")
        .map((a) => `${a.name}=${a.value}`)
        .sort()
        .join(" ") + (el instanceof HTMLInputElement ? ` [checked=${el.checked}]` : "");
    document.addEventListener("readystatechange", () => {
      if (document.readyState !== "interactive") return;
      const root = document.querySelector("main");
      const nodes = [root, ...root.querySelectorAll("*")];
      const snapshot = new Map(nodes.map((el) => [el, view(el)]));
      const text = root.textContent;
      const report = (window.__hydration = { batches: 0, records: 0, diffs: [] });
      new MutationObserver((records) => {
        report.batches++;
        report.records += records.length;
        const now = [root, ...root.querySelectorAll("*")];
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
  await p2.goto(URL, { waitUntil: "load" });
  await p2.waitForFunction(() => document.querySelectorAll("[data-sibu-island][data-sibu-enhanced]").length === 3);
  await p2.waitForTimeout(300);
  const hydration = await p2.evaluate(() => window.__hydration);
  assert.ok(hydration.records > 0, "no hubo hidratación (ninguna mutación)");
  assert.deepEqual(hydration.diffs, [], `cambios visibles al hidratar:\n${hydration.diffs.join("\n")}`);
  const after = await p2.screenshot({ fullPage: true });
  assert.ok(before.equals(after), "la captura con JS hidratado difiere de la captura sin JS");
  assert.deepEqual(consoleErrors, []);
  ok(
    `hidratación: 3 islas activas; ${hydration.records} mutaciones internas en ${hydration.batches} lote(s), ` +
      "ninguna visible al cerrar un lote (mismos nodos, atributos, texto y checked); captura idéntica a la de sin JS",
  );

  // Las islas funcionan y se coordinan.
  await p2
    .locator(".variants__option")
    .filter({ hasText: /^Azul$/ })
    .click();
  assert.match((await p2.locator(".gallery__image").getAttribute("src")) ?? "", /azul-frente/);
  await p2.locator(".variants__option").filter({ hasText: /^L$/ }).click();
  assert.equal(await text(p2.locator(".variants__price")), "₡13 500");
  assert.equal(await p2.locator(".variants__stock").textContent(), "Agotado");
  assert.ok(await p2.locator(".add-to-cart__button").isDisabled());
  await p2.locator(".variants__option").filter({ hasText: /^M$/ }).click();
  assert.ok(await p2.locator(".add-to-cart__button").isEnabled());
  await p2.locator(".gallery__thumb").nth(3).click();
  assert.match((await p2.locator(".gallery__image").getAttribute("src")) ?? "", /azul-espalda/);
  await p2.locator(".add-to-cart__button").click();
  await p2.locator(".add-to-cart__status", { hasText: "Agregado" }).waitFor();
  await p2.locator(".add-to-cart__button").click();
  await p2.locator(".add-to-cart__status", { hasText: "2 artículo(s)" }).waitFor();
  ok("islas: color → galería, talla → precio/stock/botón, miniaturas, carrito vía proxy con sesión (2 artículos)");

  // 3. Cambiar de estilo no toca componentes: mismo HTML de la ficha, distinta forma.
  const shapeOf = async (estilo) => {
    const page = await noJs.newPage();
    await page.goto(`${URL}?estilo=${estilo}`);
    const shape = await page.locator(".product-page__info").evaluate((el) => {
      const s = getComputedStyle(el);
      return { radius: s.borderTopLeftRadius, shadow: s.boxShadow, border: s.borderTopWidth };
    });
    const html = await page.locator("main").evaluate((el) => el.outerHTML);
    await page.close();
    return { shape, html };
  };
  const suave = await shapeOf("suave");
  const minimal = await shapeOf("minimal");
  assert.equal(suave.html, minimal.html, "el HTML de los componentes cambió con el estilo");
  assert.notDeepEqual(suave.shape, minimal.shape);
  assert.equal(minimal.shape.radius, "0px");
  assert.equal(minimal.shape.shadow, "none");
  ok(`estilos: HTML idéntico; suave ${JSON.stringify(suave.shape)} vs minimal ${JSON.stringify(minimal.shape)}`);
} finally {
  await browser.close();
  console.log(results.join("\n"));
}
