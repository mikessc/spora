# Progreso

Etapas del MVP en [MVP.md](MVP.md); decisiones tomadas en el camino en [DECISIONES-MVP.md](DECISIONES-MVP.md).

## Antes de producción
Cosas que funcionan en local pero hay que resolver antes de poner Spora en línea.
- **Peso del JS del cliente:** **145 KB minificado / 47 KB gzip** por página en las tiendas y 34 KB / 12 KB gzip en
  el marketplace (medido el 2026-11-20 con SibuJS 4.15.3, que arregló su tree-shaking; antes 171 KB / 58 KB y 114 KB).
  Lo que más pesa de lo que queda: 27 KB de `tailwind-merge`, que arrastra sibujs-ui. Opción: no usar sibujs-ui
  dentro de las islas. Desglose y cambios propuestos a SibuJS y sibujs-ui (hasta 41,7 KB gzip en las tiendas y
  ~6 KB en el marketplace) en [reportes/sibujs-peso-bundle.md](reportes/sibujs-peso-bundle.md). De nuestro lado, el
  nomenclátor de CR (21 KB) entra al JS de las tiendas sin usarse.
- **Meilisearch:** el marketplace usa la llave maestra en local; en línea, una llave de solo búsqueda
  (`MEILI_SEARCH_KEY`) y otra con escritura solo para el backend.
- **CSS completo de sibujs-ui (116 KB, incluye Preflight):** se carga entero porque no compilamos Tailwind. Compilar
  Tailwind v4 con solo las clases que usamos y nuestros tokens.
- **Sombras fijas de sibujs-ui:** sus componentes traen sombras de Tailwind con valores fijos (no son variables), así
  que los estilos de `@spora/themes` no las controlan. Hoy se tapan con clases propias; al compilar Tailwind, mapear
  `--shadow-*` a las variables `--sp-shadow*`.
- **Verificar el correo al registrarse:** activar `requireVerification` cuando haya correos transaccionales (hoy está
  apagado: cualquiera puede crear una cuenta con un correo ajeno). Ojo: al verificar, Vendure asigna al cliente al
  canal donde verificó; quitarlo como al registrarse.
- **Avisar al cliente para que confirme la entrega:** un correo con "¿Recibiste tu pedido?" y los dos enlaces, para que
  los pedidos no dependan del cierre por días de gracia.
- **Panel Spora compilado:** en producción se sirve la versión compilada (`pnpm --filter @spora/backend build` →
  `apps/backend/dist/dashboard`), no el Vite de desarrollo. Revisar su peso: Vite avisa de bloques de más de 500 KB.
- **Clickjacking:** proteger las tiendas con `frame-ancestors`, permitiendo el origen del Panel Spora (la vista previa
  de "Mi tienda" incrusta la tienda en un iframe).
- **Paleta desde el logo con recursos en un CDN:** el panel lee la imagen con un canvas; el dominio de los recursos debe
  permitir CORS.
- **Aviso "Vendure vX" en el panel:** lo exige la licencia GPL de Vendure; para quitarlo hace falta su licencia
  comercial (ADR 0007).

## 2026-11-20 — Segunda ronda de correcciones (tras la prueba del MVP) ✔
- Hecho:
  - **SibuJS 4.15.3:** corrige el SSR de `checked`, `selected` y `value`. Fuera el workaround; el test canario es
    ahora de regresión. El JS del cliente bajó a 145 KB / 47 KB gzip en las tiendas y 34 KB / 12 KB en el marketplace.
    Reporte marcado como resuelto; ADR 0002 al día.
  - **Panel Spora** sobre el Vendure Dashboard (React), en <http://localhost:3000/dashboard>; fuera el Admin UI clásico
    (sin mantenimiento desde julio de 2026). Marca Spora (nombre, logo provisional reemplazable, colores, español) y
    menú propio: "Mi tienda", "Comisiones" y, solo para el admin de Spora, "Marcas", "Disputas" y "Acuerdos de
    comisión". Al comercio se le ocultan las pantallas que no puede usar (canales, bodega, configuración global,
    vendedores). `/panel/comisiones` y `/panel/tienda` redirigen. [ADR 0007](adr/0007-vendure-dashboard.md).
  - **Marcas:** listado por estado; aprobar, rechazar y fusionar. En el producto, marca y categoría global se eligen
    de una lista con búsqueda, y el comercio propone una marca nueva desde ahí.
  - **Disputas:** el admin de Spora las resuelve con nota obligatoria: "Se entregó" (entregado, comisión facturable)
    o "No se entregó" (pedido cancelado, comisión anulada).
  - **Paleta de 5 colores** por tienda (primario, secundario, acento, fondo y texto) en lugar de `primaryColor`, con
    tonos derivados y texto legible (WCAG AA), los 5 estilos usando los 5 roles, vista previa en vivo, avisos de
    contraste, 8 paletas sugeridas por rubro y sugerencia desde el logo. Las tiendas existentes recibieron una paleta
    derivada de su color; el seed usa 4 paletas distintas. [ADR 0008](adr/0008-paleta-de-cinco-colores.md).
- Tests: `pnpm check` (44 tests de Vendure, regresión del SSR de SibuJS, paleta, vista previa). `pnpm e2e`
  (29 recorridos) suma el Panel Spora: comisiones, Mi tienda con paleta y vista previa, marcas con búsqueda y
  propuesta/rechazo, y resolución de disputas.
- Cómo probarlo: [PRUEBA-MVP.md](PRUEBA-MVP.md) y [LOCAL.md](LOCAL.md).
- Pendiente:
  - **Devolver el dinero** de un pedido ya pagado que Spora resuelve como "No se entregó": hoy se cancela pero la
    devolución se hace aparte.
  - El comercio puede abrir por URL las pantallas de Vendure que se le ocultan (p. ej. Canales): las ve, pero el
    servidor rechaza cualquier cambio.
  - Los textos propios de Vendure en el panel siguen la traducción de Vendure (p. ej. "Perspectivas" para Insights).

## 2026-11-19 — Correcciones post-MVP ✔
- Hecho:
  - **Seguridad:** el comercio ya no tiene `UpdateChannel` (podía cambiar comercio dueño, código, token, monedas o
    impuestos de su canal). Edita su tienda con `updateStoreSettings` (solo tema, textos, contacto y credenciales de
    TrackingApp, del canal activo) en `/panel/tienda`. Los roles existentes se actualizan al arrancar.
  - **Privacidad:** el cliente pasa a ser de una tienda (y el comercio ve sus datos) recién cuando hace su primer
    pedido ahí. Vendure ≥ 3.7 lo asignaba en cada visita; se apagó. Carrito, saludo, direcciones y la sesión compartida
    siguen funcionando en tiendas donde aún no compró. Una migración quitó las asignaciones sin pedido.
  - **Comisión sin IVA:** la base es el subtotal sin IVA ni envío. Lo anterior no se recalcula; queda marcado y el
    estado de cuenta (pantalla, PDF, CSV) dice "sin IVA".
  - **Entregas sin confirmar:** "¿Recibiste tu pedido?" en la Cuenta Spora (sin JS); "Sí" entrega el pedido y la
    comisión se vuelve facturable; "No" lo deja **en disputa** (no se factura; lista "Pedidos en disputa" en el panel).
    Al cerrar el mes, lo pendiente con 7 días o más (`SPORA_DIAS_GRACIA_CIERRE`) se factura con la marca
    "facturado al cierre sin confirmar entrega"; el comercio ve en su panel qué entra y desde cuándo.
- Tests: `pnpm check` (42 tests de Vendure, más reglas de cierre con fechas fijas: pedido del 30 con cierre el 31,
  pedido de hace 10 días, en disputa). Vendure: el comercio sin `updateChannel` ni otro canal, privacidad (visitar
  con sesión no comparte; comprar sí), confirmación del cliente, otro cliente no puede, disputa no se factura, cierre.
  `pnpm e2e` (27 recorridos) suma `/panel/tienda` y "¿Recibiste tu pedido?" sin JS con la disputa en el panel de Spora.
- Cómo probarlo: [PRUEBA-MVP.md](PRUEBA-MVP.md) (pasos 3 y 6) y [LOCAL.md](LOCAL.md).
- Pendiente:
  - **Resolver disputas:** hoy el admin de Spora las ve, pero no hay una acción para cerrarlas (facturar o anular);
    se hace a mano.
  - ~~En el Admin UI el comercio todavía ve el formulario del canal con "Guardar"~~: resuelto con el Panel Spora
    (2026-11-20).

## 2026-11-19 — M7: datos de ejemplo, pruebas de punta a punta y guía ✔ — **MVP completo**
- Hecho:
  - **`pnpm seed`**: 4 comercios con estilos distintos — Tienda Demo (moda, CRC, suave), Café Sur (café, USD,
    editorial), Barro y Telar (artesanía, CRC, pop) y Voltio (tecnología, USD, minimal) — con 37 productos y sus
    variantes (talla, color, tamaño, capacidad, algunas agotadas), categorías propias mapeadas a las globales, 4 marcas
    aprobadas y una propuesta, pagos (contra entrega, SINPE, transferencia, PayPal, Tilopay) y envíos (a domicilio,
    retiro, Correos, mensajería con TrackingApp) configurados.
  - **Cliente de prueba** `cliente@spora.localhost` con 5 pedidos en estados distintos: entregado, en camino,
    esperando comprobante (SINPE y transferencia) y devuelto. Se compran por la Shop API y se despachan con los mismos
    servicios que el Admin UI y los webhooks, así que sus comisiones son reales (facturable, pendiente, anulada).
  - `pnpm seed` espera a que la base esté lista; el clon limpio arranca con
    `docker compose up -d && pnpm install && pnpm seed && pnpm dev`.
  - **Guía de prueba**: [PRUEBA-MVP.md](PRUEBA-MVP.md), paso a paso con usuarios, URLs y qué debe verse.
- Bug encontrado por el seed y corregido: un paquete **devuelto** no cancelaba el pedido (Vendure exige cancelar las
  líneas: ahora usa `cancelOrder`, devuelve el stock y cancela la contra entrega que nunca se cobró). Test de regresión.
- Probado el **clon limpio** (`docker compose up -d && pnpm install && pnpm seed && pnpm dev` y `pnpm e2e`). Encontró y
  se corrigió:
  - bajo turbo en Windows `tsx watch` no levantaba storefront ni marketplace (ahora `node --watch`);
  - reindexar una tienda la sacaba unos instantes del marketplace (ahora reemplaza y después borra);
  - sin `.env` la telemetría de Vendure quedaba encendida (ahora apagada por defecto).
- Tests: `pnpm check` (31 tests de integración de Vendure). `pnpm e2e` (25 recorridos) suma compras en **las cuatro
  tiendas** con pagos y envíos distintos: Barro y Telar sin JS por Correos con SINPE; Voltio desde el marketplace con
  mensajería y tarjeta, entregado por webhook firmado y con su comisión del 5 % facturable en dólares.
- Pendiente (fuera del MVP o anotado antes): ver "Antes de producción", y los pendientes de M4–M6 (Correos real,
  webhooks de pago, panel de comisiones dentro del Admin UI).

## 2026-11-19 — M6: comisiones y marketplace ✔
- Hecho — **comisiones**:
  - Acuerdos por comercio con vigencias (el admin de Spora los edita); `registerStore` crea el inicial.
  - Un movimiento (`commissionEntry`) por pedido con **copia del porcentaje**, base (subtotal sin envío) y **moneda en
    que entró el dinero**. `pendiente` → `facturable` al entregar (mes de la entrega, hora de CR) → `facturado` al
    cerrar el mes; `anulado` si se cancela o devuelve.
  - **Estado de cuenta mensual** por comercio y moneda, exportable a CSV y PDF, en el **panel**
    `http://localhost:3000/panel/comisiones` (sesión del Admin UI): el comercio ve lo suyo en tiempo real; el admin
    de Spora ve todo, edita acuerdos y cierra el mes.
- Hecho — **marketplace** (`spora.localhost:5000`, `apps/marketplace`):
  - Índice global en Meilisearch alimentado por eventos de Vendure (solo tiendas activas, productos con categoría
    global y marcas aprobadas).
  - Inicio, búsqueda con filtros por **categoría global, marca, atributo, tienda, moneda y precio** (facetas que no se
    cierran al elegir), páginas de categoría y de marca, y directorio de tiendas. Cada producto lleva a su tienda.
  - Cuenta Spora también en el marketplace. Lo compartido con el storefront está en `@spora/web`.
- Bug encontrado por el e2e y corregido: publicar con `updateProduct` un producto con categoría fallaba (la regla no
  veía los custom fields). Test de regresión agregado.
- Tests: reglas de comisión con fechas fijas (**cambio de porcentaje a mitad de mes, pedido de fin de mes entregado al
  mes siguiente, pedido en CRC pagado en USD**), documentos del índice y búsqueda del marketplace; en Vendure, movimiento
  facturable tras el webhook de entrega, permisos del comercio y cierre del mes. `pnpm e2e` (23 recorridos) suma:
  marketplace entre tiendas, índice que sigue a la tienda (despublicar/publicar), cuenta en el marketplace y panel de
  comisiones con CSV.
- Cómo probarlo: [LOCAL.md](LOCAL.md).
- Pendiente:
  - Panel de comisiones dentro del Admin UI (hoy es una página aparte con la misma sesión).
  - El JS de los filtros del marketplace pesa 114 KB (núcleo de SibuJS); ver "Antes de producción".

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
