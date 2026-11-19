# Spora en local

## Arrancar desde cero
Requisitos: Node ≥ 22.3, pnpm 9, Docker Desktop y Google Chrome (solo para `pnpm e2e`).

```sh
pnpm install
cp apps/backend/.env.example apps/backend/.env   # opcional: sin .env se usan los valores de desarrollo
pnpm db              # PostgreSQL (5433) y Meilisearch (7700) en Docker
pnpm seed            # migraciones + datos de ejemplo (idempotente)
pnpm dev             # Vendure + Admin UI (3000) y storefront (4000)
```

Para empezar de cero: `pnpm db:reset && pnpm seed`.

## URLs
| Qué | URL |
| --- | --- |
| Tienda demo (portada) | <http://tienda-demo.spora.localhost:4000/> |
| Categoría con filtros | <http://tienda-demo.spora.localhost:4000/categoria/camisetas?color=negro> |
| Ficha de producto | <http://tienda-demo.spora.localhost:4000/producto/camiseta-sibu> |
| Carrito y pago | <http://tienda-demo.spora.localhost:4000/carrito> → `/checkout/datos` |
| Cuenta Spora | `/cuenta/ingresar`, `/cuenta/registro`, `/cuenta` en cualquier tienda |
| Tienda en USD | <http://cafe-sur.spora.localhost:4000/> |
| Otro estilo (vista previa) | agregar `?estilo=` con `suave`, `minimal`, `vibrante`, `editorial` o `pop` a cualquier página |
| Sitemap / robots | <http://tienda-demo.spora.localhost:4000/sitemap.xml>, `/robots.txt` |
| Admin UI (comercio y Spora) | <http://localhost:3000/admin> |
| Admin API (GraphiQL) | <http://localhost:3000/admin-api> |
| Shop API | <http://localhost:3000/shop-api> (header `vendure-token: <tienda>`) |

Las tiendas viven en `<tienda>.spora.localhost:4000`. `*.localhost` resuelve a 127.0.0.1 en Chrome, Firefox, Edge y
curl sin configurar nada.

## Usuarios de prueba
| Rol | Usuario | Clave |
| --- | --- | --- |
| Admin de Spora (superadmin) | `superadmin` | `superadmin` |
| Comercio "Tienda Demo" (CRC, solo su canal) | `demo@spora.localhost` | `demo1234` |
| Comercio "Café Sur" (USD, solo su canal) | `cafe@spora.localhost` | `cafe1234` |
| Cliente | se crea en `/cuenta/registro` de cualquier tienda | |

## Tareas comunes
- **Tema de la tienda:** Admin UI (como el comercio) → Configuración → Canales → la tienda → pestaña "Tienda": estilo,
  color de marca, tipografía, logo, frase, textos y políticas.
- **Dar de alta un comercio:** Admin API, como superadmin, mutation `registerStore` (crea comercio en estado
  `pendiente`, canal, bodega, rol y usuario). Para publicarla: Admin UI → Configuración → Vendedores → Estado
  `activo`.
- **Categorías globales y marcas:** Admin API, queries `marketplaceCategories` y `brands`; mutations
  `createMarketplaceCategory`, `proposeBrand`, `approveBrand` y `mergeBrands`. En el producto se asignan por slug en
  los campos "Categoría global" y "Marca".
- **Cambiar el esquema** (entidades o custom fields): `pnpm --filter @spora/backend migration:generate <nombre>` y
  commitear la migración de `apps/backend/src/migrations`.

## Tipo de cambio
Sin credenciales del BCCR se usa la tasa fija `BCCR_SIMULATED_RATE` (₡515,00 por defecto). Para la real, poner
`BCCR_EMAIL` y `BCCR_TOKEN` en `apps/backend/.env` (suscripción gratuita del BCCR).

## Chequeos
- `pnpm check`: formato, tipos, tests (incluye Vendure en memoria con sql.js) y lint. No necesita servidores.
- `pnpm e2e`: recorrido en Chrome; necesita `pnpm dev` corriendo.
