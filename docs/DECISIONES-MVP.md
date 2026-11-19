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

## M1

### 2026-11-19 — El alta de comercio la hace Spora
- **Duda:** pregunta abierta del PLAN: ¿registro libre de tiendas o revisión manual?
- **Decisión:** en el MVP la hace el superadmin con `registerStore` (Admin API). El comercio nace `pendiente` y Spora
  lo pasa a `activo` desde el Admin UI. No hay formulario público de registro.
- **Revertir:** exponer la misma mutation en la Shop API; el estado `pendiente` ya cubre la revisión.

### 2026-11-19 — Categoría global y marca como slug, no como relación
- **Duda:** guardarlas como relación (selector en el Admin UI) o como texto.
- **Decisión:** custom fields de texto con el slug, validados contra las entidades `MarketplaceCategory` y `Brand`.
  La regla "sin categoría no se publica" se valida al guardar el producto (subscriber de TypeORM), y Vendure guarda
  las relaciones de custom fields *después* del producto: con relación, la regla no vería la categoría. Costo: en el
  Admin UI se escribe el slug a mano.
- **Revertir:** cambiar a `type: "relation"` y mover la regla a un hook posterior al guardado (o a una extensión del
  Admin UI con selector).

### 2026-11-19 — La categoría de tienda no es obligatoria
- **Duda:** PLAN dice que cada categoría de tienda se mapea a una global.
- **Decisión:** el campo existe y se valida, pero es opcional: la colección raíz que crea Vendure no lo tiene. El
  marketplace usa la categoría del *producto*, que sí es obligatoria.
- **Revertir:** validar en un subscriber de `Collection` excluyendo la raíz.

### 2026-11-19 — Atributos comunes: lista fija y mapeo por grupo de opciones
- **Decisión:** la lista vive en `@spora/shared` (`talla`, `color`, `material`, `tamano`, `capacidad`, `sabor`). Cada
  grupo de opciones de un producto elige uno (custom field `attribute`); los valores se normalizan con `slugify` del
  nombre de la opción. Sin tabla de valores normalizados.
- **Revertir:** entidad de valores por atributo y un custom field en `ProductOption`.

### 2026-11-19 — Tiendas no activas: 403 en la Shop API
- **Decisión:** middleware en la Shop API que mira el comercio del canal (`vendure-token`) y responde 403
  `STORE_NOT_ACTIVE` si no está `activo`. El storefront muestra 404. El marketplace (M6) también filtrará por estado.
- **Revertir:** quitar el middleware de `SellersPlugin`.

### 2026-11-19 — El rol del comercio puede editar su canal
- **Duda:** el tema de la tienda (M2) vive en custom fields del canal, y editar el canal exige `UpdateChannel`.
- **Decisión:** el rol incluye `UpdateChannel`, limitado a su canal. Riesgo aceptado: puede cambiar otros datos del
  canal (p. ej. idioma). Revisar en M2 si conviene mover el tema a otra entidad.
- **Revertir:** quitar `UpdateChannel` de `SELLER_PERMISSIONS` y llevar el tema a una pantalla propia.

### 2026-11-19 — Admin UI: el plugin Angular precompilado
- **Duda:** Vendure 3 tiene el Admin UI clásico (`@vendure/admin-ui-plugin`, precompilado) y el Dashboard nuevo
  (React, se compila con Vite).
- **Decisión:** el clásico en `/admin`: no requiere build y alcanza para el panel del comercio.
- **Revertir:** cambiar a `@vendure/dashboard` (implica un paso de build).

### 2026-11-19 — Tests del backend con `node:test` y no con Vitest
- **Duda:** en Windows, Vitest carga `@vendure/core` por `c:\…` y `@vendure/testing` lo pide por `C:\…`. Node los
  trata como dos módulos y las entidades de los plugins quedan sin columna `id`. Ni `root` ni un alias lo arreglaron.
- **Decisión:** los tests de integración del backend corren con `tsx --test` (`node:test` + `node:assert`), que usa
  la misma resolución que el server. Vitest queda para los demás paquetes.
- **Revertir:** volver a Vitest si se corre siempre desde una ruta con la unidad en mayúscula, o en Linux/CI.

### 2026-11-19 — TypeScript del backend
- **Decisión:** `tsx` (esbuild) no emite la metadata de decoradores: los servicios usan `@Inject(...)` explícito y
  las columnas de TypeORM declaran su tipo. Además `useDefineForClassFields: false` (si no, los campos de clase pisan
  lo que asigna el constructor de la entidad) y `verbatimModuleSyntax: false` (las migraciones que genera Vendure
  importan interfaces como valores).
- **Revertir:** compilar con `tsc` o SWC con metadata.

### 2026-11-19 — Dominios locales y cookies
- **Decisión:** las tiendas viven en `<tienda>.spora.localhost:4000`; el dominio raíz responde 404 hasta que exista el
  marketplace (M6). Las cookies de sesión del Admin UI (`spora-admin`) y de la tienda (`spora-sesion`) tienen nombres
  distintos. Node en Windows no resuelve `*.localhost`, pero solo lo necesita el navegador: el storefront habla con
  Vendure en `localhost`.
- **Revertir:** `STORE_BASE_DOMAIN` cambia el dominio base.
