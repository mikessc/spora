# MVP local — plan de ejecución para Claude Code

Objetivo: un Spora completo **corriendo en local** que Mike pueda probar de punta a punta: crear comercios y tiendas,
publicar productos, verlos en el marketplace, comprar en una tienda, despachar y ver la comisión del mes. La puesta en
línea viene después.

Este documento manda sobre el orden de trabajo. El *qué* y el *por qué* están en [PLAN.md](PLAN.md) y [adr/](adr/).

## Cómo trabajar

- Ir en orden, etapa por etapa (M0 → M7). Cada etapa termina con **todo verde** (`pnpm check`: formato, tipos, lint,
  tests) y **un commit** (o varios) con mensaje claro. Empujar al terminar cada etapa.
- **No detenerse a preguntar** salvo que algo sea irreversible o contradiga el PLAN. Ante una duda: elegir lo más
  simple que cumpla el PLAN, anotarlo en `docs/DECISIONES-MVP.md` (fecha, duda, decisión, cómo revertir) y seguir.
- Al terminar cada etapa, actualizar `docs/PROGRESO.md`: qué se hizo, cómo probarlo, qué quedó pendiente.
- Si una etapa se traba más de lo razonable, dejarla documentada en `PROGRESO.md` con lo que falta, y pasar a la
  siguiente cuando no dependa de ella.
- Integraciones externas (PayPal, Tilopay, Correos, BCCR): **adaptador real + adaptador simulado**. En local se usa el
  simulado por defecto; el real se activa con variables de entorno. Así el MVP se prueba sin credenciales.
- Nada de credenciales en el repo. `.env.example` documenta cada variable.

## Entorno local

- `docker compose up -d` levanta PostgreSQL y Meilisearch.
- `pnpm dev` levanta backend (Vendure + admin), storefront y marketplace.
- Dominios locales con `*.localhost` (resuelven a 127.0.0.1 sin configurar nada):
  - `spora.localhost:<puerto>` → marketplace
  - `<tienda>.spora.localhost:<puerto>` → cada tienda
  - Si la cookie compartida entre subdominios de `localhost` da problemas en algún navegador, documentar el
    workaround en `DECISIONES-MVP.md` (por ejemplo, un dominio de pruebas en `/etc/hosts`).
- `pnpm seed` carga datos de ejemplo (ver M7).
- `docs/LOCAL.md`: cómo arrancar desde cero, usuarios de prueba y URLs.

## Alcance del MVP

### Entra
- Todo lo de las Fases 0 a 4 del PLAN, más los 5 estilos de diseño.
- **Panel del comercio = el Admin UI de Vendure** con roles limitados a su canal (no se construye un panel propio en
  el MVP). Las pantallas que falten (comisiones, configuración de pagos/envíos/tema) se agregan como extensiones del
  Admin UI.
- **Admin de Spora** = el mismo Admin UI con rol de superadmin.

### No entra (para después)
- Dominio propio por tienda.
- Factura electrónica de Hacienda (la factura de comisión del MVP es un estado de cuenta exportable).
- Puesta en línea, correos transaccionales reales (en local se usa un buzón de prueba o el log), WhatsApp/SMS.
- App móvil.

## Etapas

### M0 — Monorepo y prueba de SibuJS
- Monorepo pnpm + Turborepo con la estructura del PLAN §9, TypeScript estricto, Prettier, ESLint, Vitest, `pnpm check`.
- `docker-compose.yml` con PostgreSQL y Meilisearch.
- Vendure en `apps/backend` con un canal de prueba y un producto con variantes (talla y color) en CRC.
- `apps/storefront`: Hono + SibuJS SSR, ficha de producto; islas: galería, selector de variantes, agregar al carrito.
- `packages/themes`: estilos `suave` y `minimal` en variables CSS; `packages/ui`: componentes que solo usan variables.
- `packages/api-client`: cliente tipado de Vendure (sin SibuJS).
- **Criterios:** HTML completo con JS apagado; hidratación sin parpadeo; cambiar de estilo sin tocar componentes.
- Anotar el resultado en el ADR 0002. **Si SibuJS no pasa**, documentar por qué, cambiar la capa visual a Astro (o
  Next.js) y seguir: el resto del plan no cambia.

### M1 — Comercios, tiendas y catálogo
- Plugin multi-vendor: alta de comercio → crea su canal, su usuario admin y su rol limitado.
- Estados del comercio: `pendiente`, `activo`, `suspendido` (solo `activo` publica).
- Categorías globales (árbol), marcas curadas (propuesta → aprobación/fusión), atributos comunes.
- Productos con variantes; cada producto exige categoría global; categorías propias de tienda mapeadas a globales.
- Moneda base por tienda (CRC o USD); dinero en enteros de unidad menor.
- Tests de las reglas (sin categoría global no se publica; fusión de marcas).

### M2 — Storefront multi-tenant y estilos
- El hostname decide la tienda; la tienda decide estilo, paleta, tipografía, logo y textos.
- Páginas: inicio de tienda, categoría (con filtros por atributo), ficha de producto, carrito, búsqueda dentro de la
  tienda, páginas de políticas.
- Los 5 estilos: `suave`, `minimal`, `vibrante`, `editorial`, `pop`. Configuración del tema desde el panel del comercio.
- SEO básico: títulos, meta, datos estructurados de producto, sitemap por tienda.

### M3 — Cuenta Spora y checkout
- Registro e inicio de sesión únicos para marketplace y todas las tiendas (sesión compartida entre subdominios).
- Direcciones con el nomenclátor de Costa Rica (provincia, cantón, distrito). Reutilizar el seed del nomenclátor de
  TrackingApp (`mikessc/TrackingApp`, `packages/db`) copiándolo o como paquete compartido; anotar cuál.
- Checkout: dirección → envío → pago → confirmación. Historial de pedidos de todas las tiendas en la cuenta.
- Monedas: tipo de cambio BCCR diario (adaptador real + simulado con tasa fija en `.env`); precio manual opcional en
  la otra moneda; el pedido guarda moneda, monto y tipo de cambio.

### M4 — Pagos
- Interfaz común de proveedor de pago. Proveedores: contra entrega, SINPE Móvil (sube comprobante, la tienda
  confirma), transferencia (igual), PayPal (sandbox/simulado), Tilopay (sandbox/simulado).
- Cada tienda activa los suyos y guarda sus datos cifrados.
- La moneda del cobro respeta lo que exige el método (SINPE → CRC, PayPal → USD).

### M5 — Envíos
- Interfaz común: cotizar → crear guía → recibir estados.
- Proveedores: envío propio (tarifas por zona), retiro en local, Correos/Pymexpress (simulado; real por variables de
  entorno), **TrackingApp** según el contrato del PLAN §8.1.
- TrackingApp en local: probar contra una instancia local de `mikessc/TrackingApp` (ver su `docs/LOCAL.md`); si no
  está corriendo, usar un adaptador simulado que emita los mismos webhooks firmados.
- El webhook de TrackingApp se registra a mano en su panel para el MVP (el endpoint `/v1/webhooks` queda pendiente
  en TrackingApp).
- Estados del pedido actualizados por los eventos; rastreo visible en la Cuenta Spora.

### M6 — Comisiones y marketplace
- **Comisiones:** acuerdos por comercio con vigencias; `commissionEntry` por pedido (copia del porcentaje, base,
  moneda); `pendiente → facturable` al entregar, `anulado` al cancelar o devolver; estado de cuenta mensual por
  comercio y moneda (zona `America/Costa_Rica`), exportable a CSV y PDF; vista en tiempo real en el panel del comercio.
  Tests con casos de borde: cambio de porcentaje a mitad de mes, pedido de fin de mes entregado al mes siguiente,
  pedido en USD pagado en una tienda en CRC.
- **Marketplace (spora.localhost):** índice global en Meilisearch alimentado por eventos de Vendure; inicio,
  búsqueda con filtros (categoría global, marca, atributo, tienda, precio, moneda), páginas de marca, de categoría y
  directorio de tiendas. Cada producto manda a su tienda para comprar.

### M7 — Datos de ejemplo, pruebas de punta a punta y guía de prueba
- `pnpm seed`: 4 comercios con estilos distintos (moda, café, artesanía, tecnología), ~40 productos con variantes,
  precios en CRC y USD, categorías, marcas, métodos de pago y envío configurados, un cliente de prueba y pedidos en
  varios estados.
- Pruebas de punta a punta (Playwright): comprar en cada tienda con distintos pagos y envíos; ver el producto en el
  marketplace; marcar entregado y ver la comisión facturable.
- `docs/PRUEBA-MVP.md`: el recorrido que Mike debe hacer paso a paso, con usuarios y URLs, y qué debería ver en
  cada paso.

## Definición de terminado
1. Desde un clon limpio: `docker compose up -d && pnpm install && pnpm seed && pnpm dev` y todo funciona.
2. `pnpm check` y las pruebas de punta a punta en verde.
3. `docs/PRUEBA-MVP.md` se puede recorrer completo sin errores.
4. `docs/PROGRESO.md` y `docs/DECISIONES-MVP.md` al día.
