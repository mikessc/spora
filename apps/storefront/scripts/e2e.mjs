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

  // ── M3: Cuenta Spora y checkout ────────────────────────────────────────────────────────────────────────────────
  const CAFE = STORE.replace("tienda-demo", "cafe-sur");

  // Precio en la tienda en USD y aproximado en colones (tipo de cambio simulado del .env: ₡515 por dólar).
  await p1.goto(`${CAFE}/producto/cafe-tarrazu`);
  assert.equal(await text(p1.locator(".variants__price")), "$12,50");
  assert.equal(await text(p1.locator(".variants__other-price")), "≈ ₡6 437,50");
  ok("moneda: tienda en USD con precio aproximado en colones al tipo de cambio del día");

  // Registro en una tienda → la sesión vale en la otra.
  const account = await browser.newContext({ viewport });
  const pa = await account.newPage();
  const email = `ana.${Date.now()}@correo.cr`;
  await pa.goto(`${STORE}/cuenta/registro`);
  await pa.fill("#nombre", "Ana");
  await pa.fill("#apellidos", "Mora");
  await pa.fill("#correo", email);
  await pa.fill("#telefono", "8888-1234");
  await pa.fill("#clave", "clave-segura");
  await pa.click(".form__submit");
  await pa.waitForURL(`${STORE}/cuenta`);
  assert.equal(await text(pa.locator(".store-header__account")), "Hola, Ana");
  await pa.goto(`${CAFE}/`);
  assert.equal(await text(pa.locator(".store-header__account")), "Hola, Ana");
  ok("Cuenta Spora: registro en Tienda Demo y la misma sesión en Café Sur (cookie compartida entre subdominios)");

  // Compra con cuenta en Café Sur (USD): dirección del nomenclátor, envío a domicilio y contra entrega.
  const checkout = async (
    page,
    origin,
    { shipping, address, contact, payment = "Contra entrega", expectOrder = true },
  ) => {
    await page.goto(`${origin}/carrito`);
    await page.click(".cart__checkout");
    await page.waitForURL(`${origin}/checkout/datos`);
    for (const [id, value] of Object.entries(contact ?? {})) await page.fill(`#${id}`, value);
    if (address) {
      if (await page.locator('input[name="direccion"][value="nueva"]').count()) {
        await page.check('input[name="direccion"][value="nueva"]');
      }
      await page.fill("#destinatario", address.name);
      await page.fill("#telefono-envio", "8888-1234");
      await page.selectOption("#distrito", address.district);
      await page.fill("#senas", "200 m norte de la iglesia, casa verde");
    }
    await page.click(".form__submit");
    await page.waitForURL(`${origin}/checkout/envio`);
    await page.locator(".checkout__choice", { hasText: shipping }).locator("input").check();
    await page.click(".form__submit");
    await page.waitForURL(`${origin}/checkout/pago`);
    await page.locator(".checkout__choice", { hasText: payment }).locator("input").check();
    await page.click(".form__submit");
    if (!expectOrder) return null;
    await page.waitForURL(new RegExp(`${origin}/pedido/[A-Z0-9]+`));
    return text(page.locator(".order__code"));
  };
  await pa.goto(`${CAFE}/producto/cafe-tarrazu`);
  await pa.locator(".add-to-cart__button").click();
  await pa.locator(".add-to-cart__status", { hasText: "Agregado" }).waitFor();
  const cafeOrder = await checkout(pa, CAFE, {
    shipping: "Envío a domicilio",
    address: { name: "Ana Mora", district: "10201" },
  });
  assert.match(await text(pa.locator(".checkout")), /¡Gracias por su compra!/);
  assert.match(await text(pa.locator(".checkout")), /Escazú, Escazú, San José \(10201\)/);
  assert.match(await text(pa.locator(".summary__total")), /\$17,50/); // $12,50 + $5 de envío
  assert.match(await text(pa.locator(".order__rate")), /₡515\.00 por dólar/);
  ok(
    `checkout con cuenta en Café Sur: pedido ${cafeOrder}, $17,50, dirección del nomenclátor y tipo de cambio guardado`,
  );

  // Compra sin JS y sin cuenta en Tienda Demo: retiro en local.
  const guest = await browser.newContext({ javaScriptEnabled: false, viewport });
  const pg = await guest.newPage();
  await pg.goto(`${STORE}/producto/camiseta-volcan`);
  await pg.locator(".add-to-cart__button").click();
  await pg.waitForURL(`${STORE}/carrito`);
  const guestOrder = await checkout(pg, STORE, {
    shipping: "Retiro en local",
    address: { name: "Luis Rojas", district: "30101" },
    contact: { nombre: "Luis", apellidos: "Rojas", correo: `luis.${Date.now()}@correo.cr`, telefono: "8777-0000" },
  }).catch(async (err) => {
    throw new Error(`${err.message}\n${await text(pg.locator("main"))}`);
  });
  assert.match(await text(pg.locator(".summary__total")), /₡14 000/);
  assert.match(await text(pg.locator(".summary__other")), /≈ \$27,18/);
  await guest.close();
  ok(`checkout sin JS y sin cuenta en Tienda Demo: pedido ${guestOrder}, retiro en local, total ≈ en dólares`);

  // De vuelta con cuenta: la dirección guardada sale elegida; la cuenta muestra los pedidos de ambas tiendas.
  await pa.goto(`${STORE}/producto/gorra-sibu`);
  await pa.locator(".add-to-cart__button").click();
  await pa.locator(".add-to-cart__status", { hasText: "Agregado" }).waitFor();
  await pa.goto(`${STORE}/checkout/datos`);
  assert.ok(await pa.locator('input[name="direccion"]').first().isChecked());
  const demoOrder = await checkout(pa, STORE, { shipping: "Envío a domicilio" });
  await pa.goto(`${CAFE}/cuenta`);
  const rows = await pa.locator(".account__orders tbody tr").allTextContents();
  assert.equal(rows.length, 2);
  assert.ok(rows[0]?.includes(demoOrder) && rows[0].includes("Tienda Demo"), rows[0]);
  assert.ok(rows[1]?.includes(cafeOrder) && rows[1].includes("Café Sur"), rows[1]);
  assert.equal(
    await pa.locator(`.account__orders a:text("${demoOrder}")`).getAttribute("href"),
    `${STORE}/pedido/${demoOrder}`,
  );
  await pa.click(".form__secondary");
  await pa.goto(`${STORE}/`);
  assert.equal(await text(pa.locator(".store-header__account")), "Ingresar");
  await account.close();
  ok(
    "cuenta: dirección guardada, pedidos de Tienda Demo y Café Sur en un solo historial, y salir cierra la sesión en ambas",
  );
  // ── M4: pagos ──────────────────────────────────────────────────────────────────────────────────────────────────
  const buy = async (page, origin, slug) => {
    await page.goto(`${origin}/producto/${slug}`);
    await page.locator(".add-to-cart__button").click();
    // Sin JS el formulario lleva al carrito; con JS la isla agrega sin navegar.
    // La promesa que pierde la carrera vence a los 30 s: se le pone catch para que no tumbe el proceso.
    const quiet = (promise) => promise.then(() => true).catch(() => false);
    const done = await Promise.race([
      quiet(page.waitForURL(`${origin}/carrito`)),
      quiet(page.locator(".add-to-cart__status", { hasText: "Agregado" }).waitFor()),
    ]);
    assert.ok(done, "no se agregó al carrito");
  };
  const guestData = (name) => ({
    contact: {
      nombre: name,
      apellidos: "Prueba",
      correo: `${name.toLowerCase()}.${Date.now()}@correo.cr`,
      telefono: "8777-0000",
    },
    address: { name: `${name} Prueba`, district: "40101" },
    shipping: "Retiro en local",
  });

  // SINPE Móvil sin JS: instrucciones con número y monto en colones, y el comprobante se sube desde la confirmación.
  const sinpe = await browser.newContext({ javaScriptEnabled: false, viewport });
  const ps = await sinpe.newPage();
  await buy(ps, STORE, "gorra-sibu");
  const sinpeOrder = await checkout(ps, STORE, { ...guestData("Sara"), payment: "SINPE Móvil" });
  assert.match(
    await text(ps.locator(".payment")),
    /Haga un SINPE Móvil por ₡6 500 al 8888-0000 \(Tienda Demo S\.A\.\)/,
  );
  await ps.setInputFiles("#comprobante", {
    name: "comprobante.png",
    mimeType: "image/png",
    // PNG de 1×1.
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await ps.locator(".payment__upload .form__submit").click();
  await ps.waitForURL(`${STORE}/pedido/${sinpeOrder}`);
  assert.match(await text(ps.locator(".payment__receipt")), /Comprobante recibido/);
  await sinpe.close();
  ok(`SINPE sin JS: pedido ${sinpeOrder}, instrucciones con número y monto, comprobante subido`);

  // PayPal (simulado): pedido en colones, cobro en dólares; aprobar en la pasarela liquida el pago.
  const gw = await browser.newContext({ viewport });
  const pp = await gw.newPage();
  await buy(pp, STORE, "camiseta-volcan");
  await checkout(pp, STORE, { ...guestData("Pablo"), payment: "PayPal", expectOrder: false });
  await pp.waitForURL(/localhost:3000\/pagos-simulados/);
  assert.match(await text(pp.locator("body")), /PayPal \(simulado\).*\$27,18/);
  await pp.click(".aprobar");
  await pp.waitForURL(new RegExp(`${STORE}/pedido/[A-Z0-9]+`));
  assert.match(await text(pp.locator(".checkout__who")), /Pagado/);
  assert.match(await text(pp.locator(".payment__title")), /PayPal/);
  ok("PayPal simulado: pedido de ₡14 000 cobrado en dólares ($27,18), aprobado y pagado");

  // Tilopay (simulado) rechazado → vuelve al pago con aviso; un retorno falsificado tampoco pasa; luego contra entrega.
  await buy(pp, STORE, "gorra-sibu");
  await checkout(pp, STORE, { ...guestData("Tina"), payment: "Tarjeta", expectOrder: false });
  await pp.waitForURL(/pagos-simulados/);
  const approveUrl = new URL((await pp.locator(".aprobar").getAttribute("href")) ?? "");
  await pp.click(".rechazar");
  await pp.waitForURL(`${STORE}/checkout/pago?aviso=rechazado`);
  assert.match(await text(pp.locator(".form__error")), /no se completó/);
  approveUrl.searchParams.set("firma", "0".repeat(64));
  await pp.goto(approveUrl.toString());
  await pp.waitForURL(`${STORE}/checkout/pago?aviso=rechazado`);
  await pp.locator(".checkout__choice", { hasText: "Contra entrega" }).locator("input").check();
  await pp.click(".form__submit");
  await pp.waitForURL(new RegExp(`${STORE}/pedido/[A-Z0-9]+`));
  assert.match(await text(pp.locator(".checkout__who")), /Confirmado/);
  await gw.close();
  ok("Tilopay simulado: rechazo vuelve al pago, retorno con firma falsa rechazado, y se completa con contra entrega");
} finally {
  await browser.close();
  console.log(results.join("\n"));
}
