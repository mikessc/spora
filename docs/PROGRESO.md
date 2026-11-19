# Progreso

## 2026-11-19 — Fase 0: prueba de SibuJS ✔
- Hecho: monorepo pnpm + Turborepo con
  - `apps/backend`: Vendure 3.8.2 con Postgres en Docker (puerto 5433) y datos de ejemplo: canal `tienda-demo` en
    CRC (precios con IVA 13 %) y la "Camiseta Sibú" con 6 variantes de talla y color (Azul L agotada).
  - `apps/storefront`: Hono + SibuJS SSR con la ficha del producto. Islas: galería, selector de variantes y
    agregar al carrito (contra Vendure vía el proxy `/shop-api`).
  - `packages/themes`: estilos `suave` y `minimal` como variables CSS, más paleta y tipografía base. Se elige con
    `?estilo=`.
  - `packages/api-client`: cliente de la Shop API sin SibuJS; el dinero sale como `{ amount, currency }` en enteros.
- Resultado: pasan los tres criterios (HTML completo sin JS, hidratación sin parpadeo y cambio de estilo sin tocar
  componentes), verificados en Chrome con `pnpm --filter @spora/storefront check`. Detalle y hallazgos en
  [ADR 0002](adr/0002-sibujs-ssr-islas.md).
- Hallazgos de Vendure:
  - El importador CSV guarda los precios en la moneda del **canal por defecto**: el seed lo pone en CRC.
  - Un canal nuevo necesita una ubicación de stock asignada; si no, todo sale agotado.
  - Vendure trae telemetría anónima activada; se apaga con `VENDURE_DISABLE_TELEMETRY=true`.
- Atajos conscientes (marcados con `ponytail:` en el código):
  - `synchronize: true` en vez de migraciones.
  - Una sola tienda fija (`STORE_TOKEN`).
  - La descripción del producto se muestra como texto plano, sin el HTML del comercio.
  - Los componentes viven en `apps/storefront` y no en `@spora/ui`, que todavía no existe.

### Cómo correrlo
```sh
pnpm install
pnpm --filter @spora/backend db      # Postgres en Docker
pnpm --filter @spora/backend seed    # canal + producto (idempotente; db:reset para empezar de cero)
pnpm --filter @spora/backend dev     # Vendure en :3000
pnpm --filter @spora/storefront dev  # http://localhost:4000/producto/camiseta-sibu?estilo=minimal
pnpm --filter @spora/storefront check  # criterios de la Fase 0 (con los dos servidores arriba)
```

### Sigue: Fase 1 — una tienda que vende
- Dominio → canal → estilo (multi-tenant) en el storefront.
- Migraciones de Vendure.
- Extraer `@spora/ui` y `@spora/shared` (dinero y formato).
- Carrito, checkout con contra entrega y SINPE, y Cuenta Spora.
- En los formularios, revisar `value`/`checked`/`selected` en el SSR (ver ADR 0002).

## 2026-11-13 — Definición
- Hecho: idea, arquitectura, modelo de datos y decisiones iniciales (ver [PLAN.md](PLAN.md) y [adr/](adr/)).

## 2026-11-18 — Plan del MVP
- Hecho: [MVP.md](MVP.md) con el alcance y las etapas M0–M7 para tener Spora corriendo en local.
- Sigue: **M0**, monorepo y prueba de SibuJS.
