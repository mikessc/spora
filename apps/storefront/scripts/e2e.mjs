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

/** Entra al Panel Spora (Vendure Dashboard) por su formulario. La primera visita compila el panel: tiempos largos. */
async function panelAs(username, password) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(90_000);
  await page.goto("http://localhost:3000/dashboard/login");
  await page.fill('input[name="username"], input[type="text"]', username);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.endsWith("/login"));
  return { context, page };
}

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
  assert.equal(await text(p1.locator(".listing__count")), "9 productos");
  assert.match(await text(p1.locator(".store-hero")), /Ropa de algodón/);
  const homeShot = await p1.screenshot({ fullPage: true });
  const { page: p3, context: js3 } = await assertSeamlessHydration(`${STORE}/`, 2, homeShot);
  ok("portada: 9 productos sin JS; hidratación de filtros y contador sin cambios visibles");

  // Filtros: con JS se envían solos al marcar; sin JS con el botón.
  await filterOption(p3, "Negro").click();
  await p3.waitForURL(/color=negro/);
  assert.equal(await text(p3.locator(".listing__count")), "2 productos");
  await filterOption(p3, "S").click();
  await p3.waitForURL(/talla=s/);
  assert.deepEqual(await p3.locator(".product-card__name").allTextContents(), ["Camiseta Volcán"]);
  await js3.close();
  await p1.goto(`${STORE}/categoria/hombre`);
  await filterOption(p1, "Rojo").click();
  await p1.locator(".filters__apply").click();
  await p1.waitForURL(/categoria\/hombre\?color=rojo/);
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
  // ── M5: envíos ─────────────────────────────────────────────────────────────────────────────────────────────────
  // El comercio usa la Admin API (lo mismo que hace el Admin UI): en localhost, que Node sí resuelve.
  const adminApi = async (query, variables = {}, token, channel = "tienda-demo") => {
    const res = await fetch("http://localhost:3000/admin-api", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "vendure-token": channel,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
    });
    const body = await res.json();
    if (body.errors) throw new Error(JSON.stringify(body.errors));
    return { data: body.data, token: res.headers.get("vendure-auth-token") };
  };
  const { token: merchant } = await adminApi(
    `mutation { login(username: "demo@spora.localhost", password: "demo1234") { __typename } }`,
  );

  const shipper = await browser.newContext({ viewport });
  const pm = await shipper.newPage();
  const mEmail = `marta.${Date.now()}@correo.cr`;
  await pm.goto(`${STORE}/cuenta/registro`);
  for (const [id, value] of Object.entries({
    nombre: "Marta",
    apellidos: "Solís",
    correo: mEmail,
    telefono: "8666-0000",
    clave: "clave-segura",
  })) {
    await pm.fill(`#${id}`, value);
  }
  await pm.click(".form__submit");
  await pm.waitForURL(`${STORE}/cuenta`);
  await buy(pm, STORE, "gorra-sibu");
  // Cotización: envío propio por zona, Correos por peso (gorra 150 g → 1 kg, GAM) y mensajería con rastreo.
  await pm.goto(`${STORE}/carrito`);
  await pm.click(".cart__checkout");
  await pm.fill("#destinatario", "Marta Solís");
  await pm.fill("#telefono-envio", "8666-0000");
  await pm.selectOption("#distrito", "10201");
  await pm.fill("#senas", "Casa 12");
  await pm.click(".form__submit");
  await pm.waitForURL(`${STORE}/checkout/envio`);
  const quotes = (await pm.locator(".checkout__choice").allTextContents()).map((t) => t.replace(/\s+/g, " ").trim());
  assert.ok(
    quotes.some((q) => /Correos de Costa Rica \(Pymexpress\)₡2 300/.test(q)),
    quotes.join(" | "),
  );
  assert.ok(
    quotes.some((q) => /Envío a domicilio₡2 500/.test(q)),
    quotes.join(" | "),
  );
  const shippedOrder = await checkout(pm, STORE, { shipping: "Mensajería con rastreo" });

  // La tienda crea la guía (TrackingApp simulado) y el transportista reporta "en camino" y "entregado".
  const { data } = await adminApi(
    `query ($code: String!) { orders(options: { filter: { code: { eq: $code } } }) { items { id lines { id quantity } } } }`,
    { code: shippedOrder },
    merchant,
  );
  const target = data.orders.items[0];
  const { data: fulfilled } = await adminApi(
    `mutation ($input: FulfillOrderInput!) {
      addFulfillmentToOrder(input: $input) { ... on Fulfillment { id method trackingCode } ... on ErrorResult { message } }
    }`,
    {
      input: {
        lines: target.lines.map((l) => ({ orderLineId: l.id, quantity: l.quantity })),
        handler: { code: "trackingapp", arguments: [] },
      },
    },
    merchant,
  );
  const guide = fulfilled.addFulfillmentToOrder;
  assert.match(guide.trackingCode, /^SIM-\d{6}$/, JSON.stringify(guide));
  for (const event of ["en_camino", "entregado"]) {
    await adminApi(
      `mutation ($id: ID!, $event: String!) { simulateShipmentEvent(fulfillmentId: $id, event: $event) }`,
      { id: guide.id, event },
      merchant,
    );
  }
  const { data: after } = await adminApi(
    `query ($id: ID!) { order(id: $id) { state payments { state } } }`,
    { id: target.id },
    merchant,
  );
  assert.deepEqual(after.order, { state: "Delivered", payments: [{ state: "Settled" }] });
  await pm.goto(`${STORE}/cuenta`);
  const row = (await pm.locator(".account__orders tbody tr").first().textContent())?.replace(/\s+/g, " ") ?? "";
  assert.match(row, new RegExp(`${shippedOrder}.*Entregado.*${guide.trackingCode} · Entregado`));
  await pm.goto(`${STORE}/pedido/${shippedOrder}`);
  assert.match(await text(pm.locator(".shipment")), new RegExp(`TrackingApp: ${guide.trackingCode} · Entregado`));
  await shipper.close();
  ok(
    `envíos: cotiza zona y Correos; guía ${guide.trackingCode} en TrackingApp; webhooks firmados la entregan y liquidan la contra entrega; rastreo en la cuenta`,
  );
  // ── M6: marketplace y comisiones ───────────────────────────────────────────────────────────────────────────────
  const MARKET = process.env.MARKETPLACE_URL ?? "http://spora.localhost:5000";
  const mk = await browser.newContext({ viewport });
  const pk = await mk.newPage();
  await pk.goto(`${MARKET}/`);
  assert.match(await text(pk.locator(".store-hero")), /Las tiendas de Costa Rica/);
  assert.deepEqual((await pk.locator(".store-card__name").allTextContents()).sort(), [
    "Barro y Telar",
    "Café Sur",
    "Tienda Demo",
    "Voltio",
  ]);
  await pk.goto(`${MARKET}/buscar?color=rojo`);
  assert.deepEqual((await pk.locator(".product-card__name").allTextContents()).sort(), [
    "Bolso Tejido",
    "Camiseta Sibú",
    "Funda de Silicona",
    "Gorra Sibú",
    "Pañuelo Tucán",
  ]);
  await pk.goto(`${MARKET}/buscar?moneda=USD`);
  assert.match(await text(pk.locator(".product-card__price").first()), /\$.*≈ ₡/);
  await pk.goto(`${MARKET}/categoria/moda`);
  await filterOption(pk, "Tienda Demo").click();
  await pk.waitForURL(/tienda=tienda-demo/);
  assert.equal(await text(pk.locator(".listing__count")), "9 productos");
  await pk.locator(".product-card__link", { hasText: "Gorra Sibú" }).click();
  await pk.waitForURL(`${STORE}/producto/gorra-sibu`);
  ok(
    "marketplace: tiendas, búsqueda entre tiendas (color rojo), precio en USD con ≈ colones, categoría + tienda y enlace a la tienda",
  );

  // El índice lo alimentan los eventos de Vendure: si la tienda despublica un producto, sale del marketplace.
  const { data: gorra } = await adminApi(
    `{ products(options: { filter: { slug: { eq: "gorra-sibu" } } }) { items { id } } }`,
    {},
    merchant,
  );
  const setEnabled = (enabled) =>
    adminApi(
      `mutation ($id: ID!, $e: Boolean!) { updateProduct(input: { id: $id, enabled: $e }) { id } }`,
      {
        id: gorra.products.items[0].id,
        e: enabled,
      },
      merchant,
    );
  const gorraInMarket = async () => {
    await pk.goto(`${MARKET}/buscar?q=gorra`);
    return (await pk.locator(".product-card__name").allTextContents()).includes("Gorra Sibú");
  };
  const eventually = async (check, expected) => {
    for (let i = 0; i < 20; i++) {
      if ((await check()) === expected) return;
      await pk.waitForTimeout(500);
    }
    throw new Error(`el índice no llegó a ${expected}`);
  };
  await setEnabled(false);
  await eventually(gorraInMarket, false);
  await setEnabled(true);
  await eventually(gorraInMarket, true);
  ok("índice: despublicar un producto lo saca del marketplace y publicarlo lo devuelve (eventos de Vendure)");

  // Cuenta Spora también en el marketplace (misma sesión que las tiendas).
  await pk.goto(`${MARKET}/cuenta/ingresar`);
  await pk.fill("#correo", mEmail);
  await pk.fill("#clave", "clave-segura");
  await pk.click(".form__submit");
  await pk.waitForURL(`${MARKET}/cuenta`);
  assert.match(await text(pk.locator(".account__orders")), new RegExp(shippedOrder));
  assert.equal(
    await pk.locator(`.account__orders a:text("${shippedOrder}")`).getAttribute("href"),
    `${STORE}/pedido/${shippedOrder}`,
  );
  await mk.close();
  ok("Cuenta Spora en el marketplace: ingreso y pedidos con enlace a cada tienda");

  // Panel Spora (Vendure Dashboard) como comercio: comisiones y "Mi tienda"; nada de las pantallas de Spora.
  const { context: panel, page: pc } = await panelAs("demo@spora.localhost", "demo1234");
  assert.equal(await pc.title().then((t) => t.endsWith("Panel Spora")), true, await pc.title());
  assert.equal(await pc.locator("nav, [data-sidebar]").getByText("Disputas").count(), 0);
  await pc.goto("http://localhost:3000/panel/comisiones"); // la dirección vieja redirige
  await pc.waitForURL(/\/dashboard\/comisiones/);
  const movement = pc.locator("#movimientos tr", { hasText: shippedOrder });
  await movement.waitFor();
  assert.match(await text(movement), /Facturable.*₡5 752,21.*8 %.*₡460,18/); // gorra ₡6 500 con IVA → ₡5 752,21 sin IVA, al 8 %
  // Lo pendiente sin entrega confirmada, con la fecha desde la que el cierre lo factura igual.
  assert.match(await text(pc.locator("#por-cierre tbody tr").first()), /\d{1,2}\/\d{1,2}\/\d{4}.*₡/);
  const [download] = await Promise.all([pc.waitForEvent("download"), pc.click("#csv")]);
  assert.match(download.suggestedFilename(), /^comisiones-\d{4}-\d{2}\.csv$/);
  ok(
    "Panel Spora, comisiones: el comercio ve su pedido entregado como facturable (8 % sin IVA), lo que se facturará al cierre, y exporta el CSV",
  );

  // "Mi tienda" (updateStoreSettings; el comercio ya no tiene updateChannel).
  await pc.goto("http://localhost:3000/dashboard/mi-tienda");
  const tagline = pc.locator("#tagline");
  await tagline.waitFor();
  await pc.waitForFunction(() => document.querySelector("#tagline")?.value);
  const originalTagline = await tagline.inputValue();
  const save = async (value) => {
    await tagline.fill(value);
    await pc.click('#mi-tienda button[type="submit"]');
    await pc.getByText("Guardado. Los cambios ya se ven en la tienda.").last().waitFor();
  };
  await save("Frase de prueba del panel");
  const hero = await browser.newPage();
  await hero.goto(`${STORE}/`);
  assert.match(await text(hero.locator(".store-hero")), /Frase de prueba del panel/);
  await hero.close();
  await save(originalTagline);
  await panel.close();
  ok("Panel Spora, Mi tienda: el comercio cambia la frase con updateStoreSettings y la tienda la muestra");
  // ── M7: compras en las cuatro tiendas ──────────────────────────────────────────────────────────────────────────
  const BARRO = STORE.replace("tienda-demo", "barro-telar");
  const VOLTIO = STORE.replace("tienda-demo", "voltio");

  // Barro y Telar sin JS: Correos (plato de 600 g → 1 kg en la GAM) y SINPE Móvil al número de la tienda.
  const artisan = await browser.newContext({ javaScriptEnabled: false, viewport });
  const pb = await artisan.newPage();
  await buy(pb, BARRO, "plato-hondo");
  const barroOrder = await checkout(pb, BARRO, {
    ...guestData("Rosa"),
    address: { name: "Rosa Prueba", district: "10201" },
    shipping: "Correos de Costa Rica",
    payment: "SINPE Móvil",
  });
  assert.match(await text(pb.locator(".payment")), /SINPE Móvil por ₡14 300 al 8777-1111 \(Barro y Telar\)/);
  await artisan.close();
  ok(`Barro y Telar sin JS: pedido ${barroOrder} por Correos (₡12 000 + ₡2 300) con SINPE Móvil a la tienda`);

  // Voltio (USD) desde el marketplace: mensajería con rastreo y tarjeta (Tilopay simulado); se entrega y la comisión
  // (5 %) queda facturable en dólares.
  const tech = await browser.newContext({ viewport });
  const pv = await tech.newPage();
  await pv.goto(`${MARKET}/buscar?q=cargador`);
  await pv.locator(".product-card__link", { hasText: "Cargador USB-C 20 W" }).click();
  await pv.waitForURL(`${VOLTIO}/producto/cargador-usb-c-20-w`);
  assert.equal(await text(pv.locator(".variants__price")), "$18");
  await pv.locator(".add-to-cart__button").click();
  await pv.locator(".add-to-cart__status", { hasText: "Agregado" }).waitFor();
  await checkout(pv, VOLTIO, {
    ...guestData("Victor"),
    shipping: "Mensajería con rastreo",
    payment: "Tarjeta",
    expectOrder: false,
  });
  await pv.waitForURL(/pagos-simulados/);
  await pv.click(".aprobar");
  await pv.waitForURL(new RegExp(`${VOLTIO}/pedido/[A-Z0-9]+`));
  assert.match(await text(pv.locator(".checkout__who")), /Pagado/);
  assert.match(await text(pv.locator(".summary__total")), /\$22(?!,)/); // $18 + $4 de mensajería
  const voltioOrder = await text(pv.locator(".order__code"));
  await tech.close();

  const { token: voltio } = await adminApi(
    `mutation { login(username: "voltio@spora.localhost", password: "voltio1234") { __typename } }`,
    {},
    undefined,
    "voltio",
  );
  const { data: vData } = await adminApi(
    `query ($code: String!) { orders(options: { filter: { code: { eq: $code } } }) { items { id lines { id quantity } } } }`,
    { code: voltioOrder },
    voltio,
    "voltio",
  );
  const { data: vFulfilled } = await adminApi(
    `mutation ($input: FulfillOrderInput!) { addFulfillmentToOrder(input: $input) { ... on Fulfillment { id } ... on ErrorResult { message } } }`,
    {
      input: {
        lines: vData.orders.items[0].lines.map((l) => ({ orderLineId: l.id, quantity: l.quantity })),
        handler: { code: "trackingapp", arguments: [] },
      },
    },
    voltio,
    "voltio",
  );
  for (const event of ["en_camino", "entregado"]) {
    await adminApi(
      `mutation ($id: ID!, $event: String!) { simulateShipmentEvent(fulfillmentId: $id, event: $event) }`,
      { id: vFulfilled.addFulfillmentToOrder.id, event },
      voltio,
      "voltio",
    );
  }
  const month = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Costa_Rica",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
  let entry;
  for (let i = 0; i < 20 && entry?.status !== "facturable"; i++) {
    const { data: st } = await adminApi(
      `query ($m: String!) { commissionStatement(month: $m) { entries { orderCode status currency baseAmount percentage amount } } }`,
      { m: month },
      voltio,
      "voltio",
    );
    entry = st.commissionStatement.entries.find((e) => e.orderCode === voltioOrder);
    if (entry?.status !== "facturable") await new Promise((r) => setTimeout(r, 300));
  }
  assert.deepEqual(entry, {
    orderCode: voltioOrder,
    status: "facturable",
    currency: "USD",
    baseAmount: 1593, // $18 con IVA → $15,93 sin IVA
    percentage: "5",
    amount: 80,
  });
  ok(
    `Voltio desde el marketplace: pedido ${voltioOrder} ($22, tarjeta y mensajería), entregado; comisión 5 % sin IVA = $0,80 facturable`,
  );

  // ── Correcciones post-MVP: "¿Recibiste tu pedido?" sin JS y pedidos en disputa en el panel de Spora ──────────────
  const receiver = await browser.newContext({ javaScriptEnabled: false, viewport });
  const pr = await receiver.newPage();
  await pr.goto(`${STORE}/cuenta/ingresar`);
  await pr.fill("#correo", mEmail);
  await pr.fill("#clave", "clave-segura");
  await pr.click(".form__submit");
  await pr.waitForURL(`${STORE}/cuenta`);
  const pickupOrder = async () => {
    await buy(pr, STORE, "bolso-de-yute");
    return checkout(pr, STORE, { shipping: "Retiro en local", address: { name: "Marta Solís", district: "10201" } });
  };
  const receivedOrder = await pickupOrder();
  const disputedOrder = await pickupOrder();
  await pr.goto(`${STORE}/cuenta`);
  const question = (code) => pr.locator(".account__delivery", { hasText: code });
  await question(receivedOrder).locator("button", { hasText: "Sí, lo recibí" }).click();
  await pr.waitForURL(/entrega=recibido/);
  assert.match(await text(pr.locator(".account__notice")), /entregado/);
  assert.match(await text(pr.locator(".account__orders tbody tr", { hasText: receivedOrder }).first()), /Entregado/);
  assert.equal(await question(receivedOrder).count(), 0);
  await question(disputedOrder).locator("button", { hasText: "No lo recibí" }).click();
  await pr.waitForURL(/entrega=disputa/);
  assert.match(await text(question(disputedOrder)), /no recibió el pedido/);
  await receiver.close();

  const { context: sporaPanel, page: ps2 } = await panelAs("superadmin", "superadmin");
  await ps2.goto("http://localhost:3000/dashboard/disputas");
  await ps2.locator("#disputas tr", { hasText: disputedOrder }).waitFor();
  await sporaPanel.close();
  ok(
    `¿Recibiste tu pedido? sin JS: ${receivedOrder} confirmado (entregado); ${disputedOrder} no recibido, en "Pedidos en disputa" del panel de Spora`,
  );
} finally {
  await browser.close();
  console.log(results.join("\n"));
}
