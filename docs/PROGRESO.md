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
- Atajos conscientes (marcados con `ponytail:` en el código), pendientes para M1:
  - `synchronize: true` en vez de migraciones.
  - Una sola tienda fija (`STORE_TOKEN`).
  - Los componentes viven en `apps/storefront` y no en `@spora/ui`, que todavía no existe.
  - La descripción del producto se muestra como texto plano, sin el HTML del comercio.

### Cómo probarlo
```sh
pnpm install
pnpm db                              # Postgres y Meilisearch en Docker (db:reset para empezar de cero)
pnpm seed                            # canal + producto (idempotente)
pnpm --filter @spora/backend dev     # Vendure en :3000
pnpm --filter @spora/storefront dev  # http://localhost:4000/producto/camiseta-sibu?estilo=minimal
pnpm check                           # formato, tipos, tests y lint
pnpm e2e                             # criterios de la Fase 0 en Chrome (con los dos servidores arriba)
```

### Sigue: M1 — comercios, tiendas y catálogo

## 2026-11-18 — Plan del MVP
- Hecho: [MVP.md](MVP.md) con el alcance y las etapas M0–M7 para tener Spora corriendo en local.

## 2026-11-13 — Definición
- Hecho: idea, arquitectura, modelo de datos y decisiones iniciales (ver [PLAN.md](PLAN.md) y [adr/](adr/)).
