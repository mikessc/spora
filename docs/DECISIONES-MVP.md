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

## M2

### 2026-11-19 — Listados y búsqueda de la tienda en memoria
- **Duda:** usar el `DefaultSearchPlugin` de Vendure, Meilisearch o filtrar en el storefront.
- **Decisión:** el storefront pide el catálogo publicado de la tienda (de a 100) y filtra en memoria con
  `filterCatalog` / `facets` de `@spora/shared`. Los filtros por atributo salen de los grupos de opciones; dentro de
  un atributo suman (O), entre atributos se exigen todos (Y). Se filtra por producto, no por variante. El marketplace
  (M6) usa Meilisearch.
- **Revertir:** cambiar `catalog()` por una consulta a Meilisearch con el filtro `store = <tienda>`.

### 2026-11-19 — Comprar sin JS: formularios
- **Decisión:** el carrito, la cantidad, quitar y "agregar" desde la ficha son formularios POST → redirección
  (`/carrito/agregar`, `/carrito/linea`). Las islas solo mejoran: agregar sin recargar, contador del encabezado y
  filtros que se envían solos. Los avisos del carrito viajan como código fijo (`?aviso=sin-stock`), nunca como texto.
- **Revertir:** no aplica (las islas ya cubren el caso con JS).

### 2026-11-19 — Tema: campos del canal y tipografías del sistema
- **Decisión:** estilo, color de marca (validado con patrón `#RRGGBB`), tipografía, logo, frase, textos y políticas
  son campos del canal (pestaña "Tienda" del Admin UI). El storefront vuelve a validar el color antes de ponerlo en
  CSS. Las tipografías son pilas de fuentes del sistema: nada de fuentes externas.
- **Capas:** la tipografía de la tienda manda en el cuerpo; el estilo `editorial` define la de los títulos (serif).
  Los estilos no traen colores propios: `vibrante` mezcla el color de marca (`color-mix`).
- **Revertir:** fuentes web en `@spora/themes/fonts` si alguna tienda las necesita.

### 2026-11-19 — La cola de trabajos corre en el server
- **Duda:** Vendure procesa colecciones e índices en un *worker*; no había ninguno.
- **Decisión:** `JobQueueService.start()` en el mismo proceso del server (`src/index.ts`).
- **Revertir:** `bootstrapWorker(config)` en un proceso aparte cuando haya carga.

### 2026-11-19 — `?estilo=` sigue siendo público
- **Decisión:** cualquier visitante puede previsualizar otro estilo con `?estilo=`. No cambia la tienda ni se indexa
  (la canónica no lleva el parámetro). Sirve para que el comercio compare estilos antes de elegir.
- **Revertir:** aceptarlo solo con sesión del Admin.

## M3

### 2026-11-19 — Sesión compartida entre tiendas: `Domain` en la cookie
- **Duda:** cómo compartir la Cuenta Spora entre `*.spora.localhost` sin tocar el Admin UI (que vive en `localhost`).
- **Decisión:** Vendure pone la cookie `spora-sesion` sin dominio; el storefront le agrega `Domain=<dominio base>` al
  reenviarla (proxy y SSR). Chrome la acepta para `spora.localhost` (probado en `pnpm e2e`): no hizo falta el
  workaround de `/etc/hosts`.
- **Revertir:** quitar `shareSessionCookie` (cada tienda tendría su propia sesión).

### 2026-11-19 — El cliente se asigna a cada tienda donde opera
- **Duda:** Vendure solo reconoce a un cliente en los canales a los que está asignado; con la sesión compartida, al
  entrar a otra tienda el cliente "no existe" ahí.
- **Decisión:** un interceptor de la Shop API lo asigna al canal de la tienda en su primera petición autenticada
  (con caché en memoria). El historial de todas las tiendas sale de la query propia `sporaOrders`.
- **Revertir:** quitar `CustomerChannelInterceptor` de `AccountPlugin`.

### 2026-11-19 — Un carrito activo por sesión
- **Duda:** Vendure guarda un solo pedido activo por sesión. Con sesión iniciada mantiene uno por tienda; sin sesión,
  agregar algo en una segunda tienda reemplaza el carrito de la primera.
- **Decisión:** se acepta para el MVP. Con Cuenta Spora no pasa.
- **Revertir:** guardar el carrito anónimo por tienda en una cookie propia del storefront.

### 2026-11-19 — Compra sin cuenta y registro sin verificación
- **Decisión:** se puede comprar como invitado (correo y nombre en el pedido). `requireVerification: false`: la
  cuenta queda activa al registrarse, porque el MVP no manda correos reales. Si alguien se registra después con el
  mismo correo, Vendure le asocia los pedidos de invitado.
- **Revertir:** `requireVerification: true` cuando haya correos transaccionales (fuera del MVP).

### 2026-11-19 — Nomenclátor: copia de TrackingApp en `@spora/shared`
- **Duda:** MVP.md pide reutilizar el de TrackingApp copiándolo o como paquete compartido.
- **Decisión:** **copia** de los niveles provincia › cantón › distrito (563 áreas, 20 KB) en
  `packages/shared/data/nomenclator-cr.json`, con los mismos códigos (distrito = código postal de 5 dígitos; los tres
  distritos que comparten código postal llevan sufijo, igual que en TrackingApp). Se regenera con
  `packages/shared/scripts/nomenclator-desde-trackingapp.mjs`. No se copian los barrios.
- **Revertir:** publicar el nomenclátor como paquete compartido entre los dos repos.
- **En la dirección de Vendure:** provincia → `province`, cantón → `city`, distrito → custom fields `district` y
  `districtCode`, código postal → `postalCode`, señas → `streetLine1`.

### 2026-11-19 — Distrito con un solo `<select>`
- **Decisión:** un `<select>` de los 475 distritos agrupados por "Provincia › Cantón". Funciona sin JS y se busca
  tecleando. Un selector en cascada sería una isla.
- **Revertir:** isla con tres selects encadenados.

### 2026-11-19 — Toda tienda nueva nace con envío propio, retiro y contra entrega
- **Decisión:** `registerStore` crea "Envío a domicilio" (tarifa fija: ₡2 500 o $5), "Retiro en local" y "Contra
  entrega". El comercio los ajusta en el Admin UI. M4 y M5 agregan los demás proveedores.
- **Revertir:** quitar `createDefaultMethods`.

### 2026-11-19 — Tipo de cambio: se pide al usarlo, una vez por día
- **Decisión:** la primera petición del día de negocio (America/Costa_Rica) lo pide al BCCR (indicador 318, venta) y
  lo guarda; si el BCCR falla, se usa el último conocido. Sin credenciales, se usa la tasa fija `BCCR_SIMULATED_RATE`.
  No hay tarea programada.
- **Cuentas con enteros:** la tasa se guarda como texto con hasta 4 decimales y se convierte con diezmilésimas.
- **Revertir:** tarea programada de Vendure si se quiere tenerla lista a primera hora.

### 2026-11-19 — Precio manual en la otra moneda: campo de la variante
- **Duda:** Vendure soporta precios por moneda, pero exige uno en cada moneda activa del canal (o falla la consulta).
- **Decisión:** custom field `otherCurrencyPrice` (entero, unidad menor) en la variante. Si está vacío, se convierte
  con el tipo de cambio. Hoy solo se usa para mostrar; el cobro en la otra moneda llega con PayPal en M4.
- **Revertir:** activar USD/CRC en el canal con una estrategia de precios que convierta los que falten.

### 2026-11-19 — El pedido guarda el tipo de cambio al pasar a pago
- **Decisión:** un `OrderProcess` guarda la tasa y su fecha en el pedido (`exchangeRate`, `exchangeRateDate`) al pasar
  a `ArrangingPayment`. Moneda y monto los guarda Vendure.
- **Revertir:** no aplica (regla de CLAUDE.md).
