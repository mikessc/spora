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
- **Bug de SSR de SibuJS** (`checked`, `selected` y `value` reactivo no salen en el HTML del servidor): con un
  workaround en los componentes. Reporte para upstream en
  [reportes/sibujs-checked-ssr.md](reportes/sibujs-checked-ssr.md).

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
