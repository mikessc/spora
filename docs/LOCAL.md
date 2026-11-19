# Spora en local

## Arrancar desde cero
Requisitos: Node ≥ 22.3, pnpm 9, Docker Desktop y Google Chrome (solo para `pnpm e2e`).

```sh
docker compose up -d # PostgreSQL (5433) y Meilisearch (7700)
pnpm install
pnpm seed            # espera a la base, migraciones + datos de ejemplo (idempotente)
pnpm dev             # Vendure + Admin UI (3000), storefront (4000) y marketplace (5000)
```

Sin `.env` se usan los valores de desarrollo (opcional: `cp apps/backend/.env.example apps/backend/.env`). Para
empezar de cero: `pnpm db:reset && pnpm seed`. Recorrido guiado para revisar todo: [PRUEBA-MVP.md](PRUEBA-MVP.md).

## URLs
| Qué | URL |
| --- | --- |
| Marketplace | <http://spora.localhost:5000/> |
| Tienda demo (portada) | <http://tienda-demo.spora.localhost:4000/> |
| Categoría con filtros | <http://tienda-demo.spora.localhost:4000/categoria/hombre?color=rojo> |
| Ficha de producto | <http://tienda-demo.spora.localhost:4000/producto/camiseta-sibu> |
| Carrito y pago | <http://tienda-demo.spora.localhost:4000/carrito> → `/checkout/datos` |
| Cuenta Spora | `/cuenta/ingresar`, `/cuenta/registro`, `/cuenta` en cualquier tienda |
| Tiendas en USD | <http://cafe-sur.spora.localhost:4000/>, <http://voltio.spora.localhost:4000/> |
| Artesanía (CRC) | <http://barro-telar.spora.localhost:4000/> |
| Otro estilo (vista previa) | agregar `?estilo=` con `suave`, `minimal`, `vibrante`, `editorial` o `pop` a cualquier página |
| Sitemap / robots | <http://tienda-demo.spora.localhost:4000/sitemap.xml>, `/robots.txt` |
| Admin UI (comercio y Spora) | <http://localhost:3000/admin> |
| Panel de comisiones | <http://localhost:3000/panel/comisiones> (con la sesión del Admin UI) |
| Meilisearch | <http://localhost:7700> (llave de desarrollo `solo-desarrollo-meili`) |
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
| Comercio "Barro y Telar" (CRC, solo su canal) | `barro@spora.localhost` | `barro1234` |
| Comercio "Voltio" (USD, solo su canal) | `voltio@spora.localhost` | `voltio1234` |
| Cliente con 5 pedidos en distintos estados | `cliente@spora.localhost` | `cliente1234` |
| Cliente nuevo | se crea en `/cuenta/registro` de cualquier tienda | |

## Tareas comunes
- **Tema de la tienda:** <http://localhost:3000/panel/tienda> con la sesión del comercio en el Admin UI: estilo, color
  de marca, tipografía, logo, frase, textos, políticas y credenciales de TrackingApp (mutation `updateStoreSettings`).
  El comercio no puede guardar el canal en el Admin UI: el resto (monedas, impuestos, código) es del admin de Spora.
- **Dar de alta un comercio:** Admin API, como superadmin, mutation `registerStore` (crea comercio en estado
  `pendiente`, canal, bodega, rol y usuario). Para publicarla: Admin UI → Configuración → Vendedores → Estado
  `activo`.
- **Categorías globales y marcas:** Admin API, queries `marketplaceCategories` y `brands`; mutations
  `createMarketplaceCategory`, `proposeBrand`, `approveBrand` y `mergeBrands`. En el producto se asignan por slug en
  los campos "Categoría global" y "Marca".
- **Cambiar el esquema** (entidades o custom fields): `pnpm --filter @spora/backend migration:generate <nombre>` y
  commitear la migración de `apps/backend/src/migrations`.

## Pagos
- Contra entrega, SINPE Móvil y transferencia funcionan sin nada más. Con SINPE o transferencia el cliente sube el
  comprobante en la confirmación; la tienda lo ve en el Admin UI (pedido → "Comprobante de pago") y liquida el pago.
- PayPal y Tilopay usan una pasarela simulada (`http://localhost:3000/pagos-simulados`): "Aprobar" o "Rechazar". Para
  las reales: `SPORA_PAGOS_REALES=paypal,tilopay` en `apps/backend/.env` y las credenciales en el método de pago de la
  tienda (Admin UI → Configuración → Métodos de pago).

## Envíos
- En el checkout: envío a domicilio (tarifa por provincia), retiro en local, Correos (por peso, simulado) y
  "Mensajería con rastreo" (TrackingApp, simulado).
- Para despachar: Admin UI → pedido → "Preparar envío" crea la guía. Para avanzar el rastreo sin transportista real:
  Admin API, `simulateShipmentEvent(fulfillmentId, event)` con `en_camino`, `entregado`, `devuelto` o `cancelado`
  (con TrackingApp manda el webhook firmado al endpoint de la tienda).
- TrackingApp real: `SPORA_ENVIOS_REALES=trackingapp` y `TRACKINGAPP_API_URL`; la llave de cliente y el secreto del
  webhook se cargan en `/panel/tienda`. En TrackingApp se registra el webhook
  `http://localhost:3000/webhooks/trackingapp/<tienda>`.

## Comisiones y marketplace
- Cada pedido genera su comisión sobre el subtotal **sin IVA ni envío**; pasa a facturable cuando se entrega (por el
  transportista, la tienda o el cliente con "¿Recibiste tu pedido?" en su cuenta). El panel muestra el mes en curso; el
  admin de Spora cierra el mes ("Cerrar el mes") y edita los acuerdos.
- Al cerrar el mes, lo pendiente con `SPORA_DIAS_GRACIA_CIERRE` días o más (7) se factura igual, marcado "facturado al
  cierre sin confirmar entrega". Si el cliente dijo "No lo recibí", queda **en disputa** y no se factura.
- El índice del marketplace se reconstruye al arrancar Vendure y lo mantienen los eventos. Para forzarlo: Admin API,
  `reindexMarketplace` (superadmin).

## Tipo de cambio
Sin credenciales del BCCR se usa la tasa fija `BCCR_SIMULATED_RATE` (₡515,00 por defecto). Para la real, poner
`BCCR_EMAIL` y `BCCR_TOKEN` en `apps/backend/.env` (suscripción gratuita del BCCR).

## Chequeos
- `pnpm check`: formato, tipos, tests (incluye Vendure en memoria con sql.js) y lint. No necesita servidores.
- `pnpm e2e`: recorrido en Chrome; necesita `pnpm seed` y `pnpm dev` corriendo.

## Datos de ejemplo
`pnpm seed` crea 4 tiendas (moda, café, artesanía y tecnología), 37 productos, marcas (una solo propuesta), métodos
de pago y envío y el cliente de prueba con sus pedidos. Los productos están en `apps/backend/seed/tiendas/*.csv`
(formato del importador de Vendure); los `*.mas.csv` y sus imágenes salen de `node apps/backend/seed/generar-catalogo.mjs`.
