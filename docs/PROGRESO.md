# Progreso

Etapas del MVP en [MVP.md](MVP.md); decisiones tomadas en el camino en [DECISIONES-MVP.md](DECISIONES-MVP.md).

## Antes de producción
Cosas que funcionan en local pero hay que resolver antes de poner Spora en línea.
- **Peso del JS del cliente:** 171 KB minificado / **58 KB gzip** por página. ~120 KB son del núcleo de SibuJS (su
  `dist` agrupa muchos módulos por chunk y el tree-shaking rinde poco) y 27 KB de `tailwind-merge`, que arrastra
  sibujs-ui. Opciones: preguntar upstream, o no usar sibujs-ui dentro de las islas.
- **CSS completo de sibujs-ui (116 KB, incluye Preflight):** se carga entero porque no compilamos Tailwind. Compilar
  Tailwind v4 con solo las clases que usamos y nuestros tokens.
- **Sombras fijas de sibujs-ui:** sus componentes traen sombras de Tailwind con valores fijos (no son variables), así
  que los estilos de `@spora/themes` no las controlan. Hoy se tapan con clases propias; al compilar Tailwind, mapear
  `--shadow-*` a las variables `--sp-shadow*`.
- **Bug de SSR de SibuJS** (`checked`, `selected` y `value` reactivo no salen en el HTML del servidor; confirmado con un
  test canario en M3): con un
  workaround en los componentes. Reporte para upstream en
  [reportes/sibujs-checked-ssr.md](reportes/sibujs-checked-ssr.md).

## 2026-11-19 — M5: envíos ✔
- Hecho:
  - **Interfaz común**: cotizar (calculadora de Vendure) → crear la guía (botón del Admin UI) → recibir estados (un solo
    servicio que mueve guías y pedidos). Cada tienda activa los suyos en el Admin UI.
  - **Envío propio con tarifa por provincia**, **retiro en local**, **Correos de Costa Rica (Pymexpress)** por peso y
    destino (simulado) y **TrackingApp** según el PLAN §8.1: `POST /v1/shipments` con `Idempotency-Key` por pedido,
    `externalRef`, destinatario y `codAmount`; y webhooks firmados (HMAC, ventana de 5 min) procesados una sola vez
    por id de evento.
  - **Adaptador real + simulado**: TrackingApp real con `SPORA_ENVIOS_REALES=trackingapp` y la llave de la tienda; el
    simulado crea guías `SIM-…` y `simulateShipmentEvent` manda webhooks firmados de verdad.
  - **Estados**: en camino → enviado; entregado → pedido entregado y **contra entrega liquidada**; devuelto o
    cancelado → pedido cancelado. Un pedido con contra entrega se puede despachar antes de cobrar.
  - **Rastreo en la Cuenta Spora** y en la confirmación del pedido (código, enlace y último estado).
  - Peso por variante (para cotizar); llave y secreto de TrackingApp cifrados en el canal.
  - `migration:generate` aplica antes las migraciones pendientes (evita generar el esquema entero por error).
- Tests: firma de TrackingApp (válida, alterada, otro secreto, vieja) y tarifa de Correos; en Vendure, webhook firmado
  que entrega y liquida, repetido sin efecto, firma falsa → 401 y tienda sin TrackingApp → 404. `pnpm e2e` (19
  recorridos) suma: cotización por zona y Correos, guía en TrackingApp, webhooks de "en camino" y "entregado", y el
  rastreo en la cuenta del cliente.
- Cómo probarlo: [LOCAL.md](LOCAL.md).
- Pendiente:
  - Correos real (falta el contrato del Web Service, que da Correos) y prueba contra una instancia local de TrackingApp.
  - En TrackingApp: aceptar el código del nomenclátor en el destinatario, la moneda de `codAmount` y el endpoint
    `/v1/webhooks` para registrarse sola. Ver [DECISIONES-MVP.md](DECISIONES-MVP.md).
- Sigue: **M6**, comisiones y marketplace.

## 2026-11-19 — M4: pagos ✔
- Hecho:
  - **Interfaz común**: cada proveedor es un handler de pago de Vendure y le dice al storefront qué sigue (listo,
    instrucciones + comprobante, o ir a la pasarela). El checkout no conoce proveedores: uno nuevo es un handler más.
  - **Proveedores**: contra entrega; **SINPE Móvil** y **transferencia** (instrucciones con monto y datos de la
    cuenta, el cliente sube el comprobante y la tienda liquida el pago en el Admin UI); **PayPal** y **Tilopay**
    (redirección a la pasarela; a la vuelta el backend confirma con ella, idempotente).
  - **Adaptador real + simulado**: por defecto, PayPal y Tilopay usan una pasarela simulada (aprobar o rechazar, con
    enlaces firmados). Con `SPORA_PAGOS_REALES=paypal,tilopay` se usan las APIs reales (PayPal Orders v2; Tilopay
    `processPayment` + `consult`) con las credenciales de cada tienda.
  - **Cada tienda activa los suyos** en el Admin UI. Sus datos (número SINPE, IBAN, llaves) se guardan **cifrados**
    (AES-256-GCM).
  - **La moneda del cobro la impone el método**: SINPE → CRC, PayPal → USD, transferencia → la de la cuenta. Se
    convierte con el tipo de cambio del pedido y el cobro real queda en el pago (para las comisiones de M6).
  - Seed: Tienda Demo con SINPE, transferencia, PayPal y Tilopay; Café Sur con transferencia en USD, PayPal y Tilopay.
- Tests: en Vendure, credenciales cifradas en la base y en claro para el Admin, SINPE en tienda USD cobrado en colones,
  PayPal (URL de retorno ajena rechazada, retorno falso rechazado, retorno firmado liquida una sola vez) y el parser
  del BCCR. `pnpm e2e` (18 recorridos) suma: SINPE sin JS con comprobante, PayPal simulado (pedido en colones cobrado
  en dólares) y Tilopay rechazado con firma falsa, y luego completado con contra entrega.
- Cómo probarlo: [LOCAL.md](LOCAL.md).
- Pendiente:
  - Webhooks de PayPal y Tilopay (el de compras de Tilopay solo lo da su soporte) y una prueba con credenciales de
    sandbox reales.
  - Avisar al cliente por correo cuando la tienda confirma un SINPE o una transferencia (fuera del MVP: no hay correos).
- Sigue: **M5**, envíos.

## 2026-11-19 — M3: Cuenta Spora y checkout ✔
- Hecho:
  - **Cuenta Spora única**: registro, ingreso y salida desde cualquier tienda; la sesión se comparte entre
    `*.spora.localhost` (la misma cuenta sirve en todas). El cliente se asigna solo a cada tienda donde opera.
    "Mi cuenta" muestra los pedidos de **todas las tiendas** (con enlace a cada una) y las direcciones guardadas.
  - **Direcciones con el nomenclátor de Costa Rica**, copiado de TrackingApp con sus mismos códigos (provincia ›
    cantón › distrito = código postal).
  - **Checkout** en pasos: datos y dirección → envío → pago → confirmación. Con cuenta (direcciones guardadas) o como
    invitado. Todo con formularios: funciona sin JS. Cada tienda nueva nace con envío a domicilio, retiro en local y
    contra entrega.
  - **Monedas**: tipo de cambio de venta del BCCR por día de negocio (adaptador real con credenciales en `.env` y
    simulado con tasa fija por defecto). Precio aproximado en la otra moneda en ficha y resumen. Precio manual opcional
    en la otra moneda (campo de la variante). **El pedido guarda moneda, monto y tipo de cambio** al pasar a pago.
  - Segunda tienda de ejemplo, **Café Sur, en USD**. El seed ahora es por datos (lista de tiendas con su CSV).
  - Precios como en Costa Rica: "$12,50" (no "USD 12,50").
- **Bug de SSR de SibuJS con `value` y `selected`**: confirmado con un test canario (`packages/ui/src/ssr-form.test.ts`).
  `selected` (fijo o reactivo), `checked` y `value` reactivo no salen en el HTML del servidor. Los formularios usan
  `markIf()`, probado en el mismo test. Si el canario falla, upstream lo arregló y se puede quitar el workaround.
- Tests: tipo de cambio (enteros, fecha de negocio en CR, parser del BCCR), nomenclátor, cookie compartida y
  redirecciones seguras; en Vendure: métodos por defecto de una tienda nueva, cuenta reconocida en otra tienda, tasa
  guardada al pasar a pago e historial de todas las tiendas. `pnpm e2e` (15 recorridos) suma: precio en USD con ≈ en
  colones, registro y sesión compartida, compra con cuenta en Café Sur (USD), compra sin JS y sin cuenta en Tienda
  Demo, compra con dirección guardada, historial con las dos tiendas y salida.
- Cómo probarlo: [LOCAL.md](LOCAL.md).
- Pendiente:
  - Un visitante sin cuenta que agrega en una segunda tienda pierde el carrito de la primera (un carrito activo por
    sesión en Vendure). Con cuenta no pasa. Ver [DECISIONES-MVP.md](DECISIONES-MVP.md).
  - Las cuentas solo se gestionan desde las tiendas; el marketplace (M6) usará las mismas páginas.
- Sigue: **M4**, pagos.

## 2026-11-19 — M2: storefront multi-tenant y estilos ✔
- Hecho:
  - **Páginas de la tienda** (SSR, todas funcionan sin JS): portada (frase y presentación), categoría con **filtros por
    atributo común** (talla, color…), búsqueda dentro de la tienda (sin tildes ni mayúsculas), ficha, **carrito**
    (cantidad y quitar) y políticas de envíos, devoluciones y privacidad. Encabezado con buscador, contador del
    carrito y menú de categorías; pie con políticas y contacto.
  - **Comprar sin JS**: la ficha es un formulario (opciones + botón); el carrito usa formularios POST → redirección.
    Con JS, las islas agregan sin recargar y actualizan el contador del encabezado.
  - **Islas nuevas** (`enhance`): filtros que se envían solos y contador del carrito. Hidratación sin cambios visibles
    también en los listados.
  - **Los 5 estilos**: `suave`, `minimal`, `vibrante`, `editorial` y `pop`, con el mismo juego de variables (un test
    lo exige). **Paleta** (color de marca, con texto legible calculado) y **tipografía** (pilas del sistema) como capas
    independientes.
  - **Tema desde el panel del comercio**: campos del canal en el Admin UI, pestaña "Tienda" (estilo, color,
    tipografía, logo, frase, textos, contacto y políticas). El comercio solo puede editar su canal.
  - **SEO**: título y descripción por página, canónica, Open Graph, JSON-LD `Product` con un `Offer` por variante,
    `sitemap.xml` y `robots.txt` por tienda, `noindex` en búsqueda y carrito.
  - Seed con 3 productos, 2 categorías de tienda (mapeadas a globales) y el tema de la tienda demo. La cola de
    trabajos de Vendure corre en el server. `pnpm dev` recompila las islas al guardar.
- Tests: filtros y facetas, paleta y estilos (Vitest); tema por canal y permisos (Vendure en memoria). `pnpm e2e`
  recorre en Chrome: dominio, ficha y portada sin JS, hidratación sin cambios visibles, islas, filtros con y sin JS,
  búsqueda, carrito completo sin JS, aviso de agotado, JSON-LD, sitemap y los 5 estilos con el mismo HTML.
- Cómo probarlo: [LOCAL.md](LOCAL.md).
- Pendiente:
  - El carrito no cotiza envío todavía (M3/M5) y no hay botón de pago (M3).
  - Las páginas piden el catálogo completo en cada request (sin caché); bien para tiendas de cientos de productos.
- Sigue: **M3**, Cuenta Spora y checkout.

## 2026-11-19 — M1: comercios, tiendas y catálogo ✔
- Hecho:
  - **Alta de comercio** (`registerStore`, Admin API, superadmin): crea comercio, canal (moneda base CRC o USD),
    **ubicación de stock propia**, rol limitado a su canal y usuario administrador. Lo mismo usa el seed, así que
    todo canal nuevo nace con bodega.
  - **Estados del comercio** `pendiente` / `activo` / `suspendido` (custom field del vendedor, solo superadmin). Una
    tienda no activa responde 403 en la Shop API y 404 en el storefront.
  - **Catálogo global** (plugin `catalog`): categorías del marketplace en árbol, marcas curadas (proponer sin duplicar
    → aprobar → fusionar, que mueve los productos de todas las tiendas) y atributos comunes por grupo de opciones.
  - **Regla de publicación**: un producto publicado exige categoría global; vale para el Admin UI, la API y el
    importador.
  - **Migraciones** en vez de `synchronize` (`src/migrations`, se aplican al arrancar y en el seed).
  - **`@spora/ui`** con los componentes (galería, selector de variantes, agregar al carrito) y su CSS;
    **`@spora/shared`** con dinero, tipos de catálogo, `slugify` y atributos comunes.
  - **La tienda se elige por dominio**: `<tienda>.spora.localhost:4000`; el estilo sale del canal (`?estilo=` sigue
    sirviendo como vista previa).
  - Admin UI de Vendure en `/admin`; telemetría de Vendure apagada en `.env.example`.
- Tests: 9 de integración contra Vendure en memoria (alta, bodega, rol, 403 por estado, árbol de categorías, regla de
  publicación, marcas sin duplicados, fusión) + unitarios de dominio de tienda. `pnpm check` y `pnpm e2e` en verde.
- Cómo probarlo: [LOCAL.md](LOCAL.md) (arranque, URLs y usuarios).
- Pendiente:
  - En el Admin UI la categoría global y la marca se escriben como slug (no hay selector) y no hay pantallas para
    aprobar o fusionar marcas: se hace por la Admin API. Ver [DECISIONES-MVP.md](DECISIONES-MVP.md).
  - ~~`pnpm dev` no recompila el JS del cliente al editar islas~~ (resuelto en M2).
- Sigue: **M2**, storefront multi-tenant y estilos.

## 2026-11-19 — M0: monorepo y prueba de SibuJS ✔
M0 se da por hecho con la prueba de la Fase 0 del PLAN.
- Hecho: monorepo pnpm + Turborepo con
  - `apps/backend`: Vendure 3.8.2 con Postgres en Docker (puerto 5433) y datos de ejemplo: canal `tienda-demo` en
    CRC (precios con IVA 13 %) y la "Camiseta Sibú" con 6 variantes de talla y color (Azul L agotada).
  - `apps/storefront`: Hono + SibuJS SSR con la ficha del producto. Islas: galería, selector de variantes y
    agregar al carrito (contra Vendure vía el proxy `/shop-api`).
  - `packages/themes`: estilos `suave` y `minimal` como variables CSS, más paleta y tipografía base. Se elige con
    `?estilo=`.
  - `packages/api-client`: cliente de la Shop API sin SibuJS; el dinero sale como `{ amount, currency }` en enteros.
  - Herramientas: Prettier, ESLint, Vitest y `pnpm check`. `docker-compose.yml` en la raíz con Postgres y
    Meilisearch.
- Resultado: pasan los tres criterios (HTML completo sin JS, hidratación sin parpadeo y cambio de estilo sin tocar
  componentes), verificados en Chrome con `pnpm e2e`. Detalle y hallazgos en
  [ADR 0002](adr/0002-sibujs-ssr-islas.md).
- Hallazgos de Vendure:
  - El importador CSV guarda los precios en la moneda del **canal por defecto**: el seed lo pone en CRC.
  - Un canal nuevo necesita una ubicación de stock asignada; si no, todo sale agotado.
  - Vendure trae telemetría anónima activada; se apaga con `VENDURE_DISABLE_TELEMETRY=true`.
- Atajos conscientes: `synchronize`, una sola tienda fija y componentes fuera de `@spora/ui` (resueltos en M1). Queda:
  la descripción del producto se muestra como texto plano, sin el HTML del comercio.


## 2026-11-18 — Plan del MVP
- Hecho: [MVP.md](MVP.md) con el alcance y las etapas M0–M7 para tener Spora corriendo en local.

## 2026-11-13 — Definición
- Hecho: idea, arquitectura, modelo de datos y decisiones iniciales (ver [PLAN.md](PLAN.md) y [adr/](adr/)).
