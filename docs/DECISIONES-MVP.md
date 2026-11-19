# Decisiones del MVP

Dudas que surgieron al ejecutar [MVP.md](MVP.md) y cómo se resolvieron sin detenerse a preguntar. Cada una dice
cómo revertirla.

## M0

### 2026-11-19 — M0 se da por hecho con la prueba de la Fase 0
- **Duda:** M0 pide además Prettier, ESLint, Vitest, `pnpm check`, Meilisearch en el compose y `packages/ui`.
- **Decisión:** la prueba de SibuJS cuenta como M0 (lo pidió Mike). Las herramientas y el compose con Meilisearch se
  agregan como cierre de M0, porque cada etapa termina con `pnpm check` en verde. `packages/ui` pasa a M1.
- **Revertir:** no aplica.

### 2026-11-19 — Qué corre `pnpm check`
- **Duda:** qué incluye el chequeo de cada etapa y si el chequeo con navegador entra.
- **Decisión:** `pnpm check` = `prettier --check .` + `tsc` + Vitest (vía Turborepo) + `eslint .`. No necesita
  servidores arriba. El chequeo con Chrome (`pnpm e2e`) necesita Vendure y el storefront corriendo, así que va
  aparte y se corre al cerrar cada etapa que toque el front.
- **Revertir:** sumar `pnpm e2e` al script `check` de la raíz.

### 2026-11-19 — Prettier no toca los `.md`
- **Duda:** Prettier reformatea tablas y párrafos de los docs escritos a mano.
- **Decisión:** `.prettierignore` excluye `*.md`.
- **Revertir:** quitar la línea `*.md` de `.prettierignore` y correr `pnpm format`.

### 2026-11-19 — `docker-compose.yml` en la raíz
- **Duda:** estaba en `apps/backend`; MVP.md pide `docker compose up -d` desde la raíz con Postgres y Meilisearch.
- **Decisión:** compose en la raíz con nombre de proyecto `spora` (se conserva el volumen de Postgres). Meilisearch
  en el puerto 7700 con clave de desarrollo por defecto (`MEILI_MASTER_KEY`). `pnpm db` y `pnpm db:reset` en la
  raíz.
- **Revertir:** mover el archivo de vuelta a `apps/backend`.
