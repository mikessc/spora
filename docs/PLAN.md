# Spora — plan del producto y arquitectura

Estado: borrador v1 (2026-11-13). Las decisiones de fondo están en [`adr/`](adr/).

## 0. La idea en una línea

Tiendas en línea **gratis** para pymes de Costa Rica; Spora gana una **comisión** negociada con cada comercio. Un
marketplace central (spora.cr) funciona como directorio de todas las tiendas y sus productos.

## 1. Glosario (el código usa estos nombres)

| Término | En código | Qué es |
|---|---|---|
| Comercio | `seller` | La pyme: dueña de una tienda, firma el acuerdo de comisión con Spora |
| Tienda | `store` | El sitio del comercio (`tienda.spora.cr`). En Vendure es un **canal** (`Channel`) |
| Marketplace | `marketplace` | spora.cr: directorio que mezcla productos, marcas, categorías y tiendas. **No vende** |
| Cliente | `customer` | Quien compra. Tiene **una sola Cuenta Spora** para todas las tiendas |
| Pedido | `order` | Compra hecha en una tienda (siempre de un solo comercio) |
| Categoría global | `marketplaceCategory` | Árbol curado por Spora (Moda › Mujer › Vestidos) |
| Categoría de tienda | `storeCollection` | Menú propio de la tienda; cada una se mapea a una categoría global |
| Marca | `brand` | Catálogo único global, curado por Spora |
| Atributo común | `attribute` | Talla, color, material: hace que los filtros funcionen entre tiendas |
| Estilo | `designStyle` | Forma visual: radios, sombras, bordes, gradientes, espaciado |
| Movimiento de comisión | `commissionEntry` | Una línea por pedido: base, porcentaje, monto, moneda, estado |
| Factura de comisión | `commissionInvoice` | Agrupa los movimientos facturables del mes por comercio y moneda |
| Proveedor de pago | `paymentProvider` | Contra entrega, SINPE Móvil, transferencia, PayPal, Tilopay… |
| Proveedor de envío | `shippingProvider` | Envío propio, retiro en local, Correos (Pymexpress), TrackingApp… |

## 2. Arquitectura

```
               ┌──────────────────────────────────────────────┐
               │ Vendure (TypeScript, headless) — 1 PostgreSQL │
               │  canal por tienda · plugin multi-vendor ·     │
               │  plugins de pago · plugins de envío ·         │
               │  plugin de comisiones · Cuenta Spora          │
               └───────┬───────────────────────────┬──────────┘
                       │ API (GraphQL)             │ eventos
        ┌──────────────┴─────────────┐      ┌──────┴────────┐
        │ apps/storefront            │      │ Meilisearch   │
        │ Servidor Hono + SibuJS SSR │      │ índice global │
        │ + islas · multi-tenant por │      └──────┬────────┘
        │ dominio · tema por tokens  │             │
        └──────────────┬─────────────┘             │
                       │                           │
        ┌──────────────┴─────────────┐             │
        │ apps/marketplace (spora.cr)├─────────────┘
        │ mismo stack, lee todas las │
        │ tiendas + buscador global  │
        └────────────────────────────┘
                 @spora/ui (componentes) + @spora/themes (estilos y tokens)
```

- **Backend:** Vendure. Cada tienda es un canal con su catálogo, precios, stock, métodos de pago y envío. Un solo
  backend y una sola base de datos ([ADR 0001](adr/0001-vendure-headless.md)).
- **Front:** SibuJS con SSR (`renderToString` + `hydrate`) e islas, servido por Hono. La página llega como HTML (SEO) y
  solo se activan carrito, filtros, buscador y checkout ([ADR 0002](adr/0002-sibujs-ssr-islas.md)).
- **Multi-tenant:** el dominio del request decide la tienda; la tienda decide el tema. `tienda.spora.cr` al inicio,
  dominio propio después.
- **Búsqueda del marketplace:** Meilisearch con un índice global (productos de todas las tiendas), alimentado por
  eventos de Vendure. Filtros por categoría global, marca, atributo, tienda, zona y precio.
- **Cuenta Spora:** login único. En subdominios de spora.cr la sesión se comparte por cookie; con dominio propio se
  usa un intercambio de token (fase posterior).
- **Independencia del framework:** el cliente de la API de Vendure, los tipos y los tokens de tema **no** dependen de
  SibuJS. Si un día se cambia de framework, solo se rehace la capa visual.

## 3. Modelo de datos

### 3.1 Global (Spora)
- **Clientes** (Cuenta Spora): datos, direcciones con nomenclátor (provincia, cantón, distrito), favoritos, historial
  de pedidos de todas las tiendas.
- **Comercios**: datos del negocio, contacto de facturación, estado (`pendiente`, `activo`, `suspendido`) y
  **acuerdos de comisión** (porcentaje negociado con fecha de vigencia; ver §5).
- **Categorías globales**: árbol curado por Spora.
- **Marcas**: catálogo único. La tienda **propone** marcas; Spora aprueba o fusiona duplicados.
- **Atributos comunes**: talla, color, material… con valores normalizados.
- **Nomenclátor de Costa Rica**: el **mismo** que usa TrackingApp, para que las direcciones pasen sin traducción.

### 3.2 De cada tienda (canal de Vendure)
- Productos con **variantes desde el día uno** (grupos de opciones mapeados a los atributos comunes).
- Precio por variante en la moneda base de la tienda (ver §6), stock.
- Categorías propias (`storeCollection`), cada una mapeada a una categoría global.
- Métodos de pago activos y sus datos (número SINPE, IBAN, credenciales de Tilopay/PayPal) — **cifrados**.
- Proveedores de envío activos y su configuración (tarifas por zona, credenciales de Correos, llave de TrackingApp).
- Tema: estilo + paleta + tipografía, logo, textos, políticas, dominio.
- Pedidos.

### 3.3 Reglas
1. **Todo producto tiene una categoría global.** Sin ella no se publica.
2. **Marcas curadas** (propuesta → aprobación/fusión).
3. **La comisión se vuelve facturable cuando el pedido se entrega**, no cuando se crea (las cancelaciones de contra
   entrega no se cobran).

## 4. Pagos

Una interfaz común de proveedor de pago; cada tienda activa los suyos. Desde el día uno:

| Proveedor | Moneda | Cómo se confirma |
|---|---|---|
| Contra entrega | CRC (y USD si la tienda lo acepta) | Al entregar; con TrackingApp, el chofer reporta el cobro |
| SINPE Móvil | CRC | El cliente sube el comprobante; la tienda confirma |
| Transferencia | CRC o USD | Comprobante; la tienda confirma |
| PayPal | USD | Automático (API) |
| Tilopay | CRC o USD | Automático (API) |

Una pasarela nueva es un plugin más; nada más cambia. El dinero siempre va **directo al comercio**.

## 5. Comisiones ([ADR 0003](adr/0003-comision-mensual-por-confianza.md))

- Porcentaje **negociado por comercio**, con historial de vigencias.
- Cada pedido genera un `commissionEntry` que **guarda una copia** del porcentaje vigente, la base y la moneda. Renegociar
  no cambia pedidos pasados.
- Estados: `pendiente` → `facturable` (pedido entregado) → `facturado`; o `anulado` (cancelado o devuelto).
- **Factura mensual** por comercio, con subtotal por moneda (CRC y USD). La moneda es la moneda en que **entró el
  dinero** (un producto en colones pagado por PayPal cuenta en USD).
- El comercio ve su comisión acumulada en tiempo real en su panel: la factura nunca sorprende.
- Modelo basado en **confianza**: es parte de la propuesta de valor.

## 6. Monedas ([ADR 0004](adr/0004-monedas-crc-usd.md))

- La tienda elige su **moneda base** (CRC o USD) y pone **un precio** por variante.
- Spora convierte al tipo de cambio de venta del BCCR (tomado una vez al día) para mostrar en la otra moneda y para
  cobrar cuando el método de pago lo exige (PayPal → USD).
- Opción avanzada: precio manual en la otra moneda (para números redondos).
- El pedido guarda moneda, monto y tipo de cambio usados.

## 7. Estilos de diseño ([ADR 0005](adr/0005-estilos-de-diseno.md))

Tres capas independientes que la tienda combina:
1. **Estilo** (forma): `suave`, `minimal`, `vibrante`, `editorial`, `pop`.
2. **Paleta** (color de marca).
3. **Tipografía.**

Cada estilo es un archivo de variables CSS en `@spora/themes`. Los componentes de `@spora/ui` solo consumen variables:
nunca un color, radio o sombra fijo. Agregar un estilo = un archivo nuevo.

## 8. Envíos e integraciones ([ADR 0006](adr/0006-integracion-trackingapp-correos.md))

Interfaz común: **cotizar → crear guía → recibir estados**. Desde el día uno: envío propio (tarifas por zona), retiro
en local, Correos de Costa Rica (Pymexpress) y TrackingApp. El cliente ve el rastreo en su Cuenta Spora.

### 8.1 Contrato con TrackingApp (`mikessc/TrackingApp`, API `/v1`)
- **Autenticación:** la tienda es un `client` dentro de la `organization` (empresa de logística) que usa TrackingApp.
  La tienda pega en Spora su **llave de cliente** (scope `shipments:write`, `packages:read`). Se guarda cifrada.
- **Crear envío:** `POST /v1/shipments` con header `Idempotency-Key: spora-order-<id>`.
  - `externalRef` = código del pedido de Spora.
  - `recipient` = cliente y dirección (nomenclátor compartido).
  - `packages[]` = bultos con `description`, `weightKg` y `codAmount` cuando el pago es contra entrega.
  - Respuesta: `trackingNumber`, `publicCode`, `trackingUrl` por paquete → se guardan en el pedido.
- **Estados:** webhooks firmados con HMAC (`X-Tracking-Signature`, `X-Tracking-Event`, `X-Tracking-Event-Id`,
  `X-Tracking-Attempt`). Eventos: `package.created`, `package.status_changed`, `package.delivered`,
  `package.returned`, `package.cancelled`, `package.rescheduled`.
  - `package.delivered` → pedido **entregado** → `commissionEntry` pasa a **facturable**.
  - `package.returned` / `package.cancelled` → `commissionEntry` **anulado**.
  - Idempotente por `X-Tracking-Event-Id`.
- **Pendiente en TrackingApp:** hoy los webhooks los registra el admin de la empresa en su panel. Para que la
  conexión sea "pegar la llave y listo", conviene un endpoint `/v1/webhooks` para que Spora se registre sola.
- **Pendiente:** `codAmount` no lleva moneda; definir cómo se manejan pedidos contra entrega en USD.

### 8.2 Correos de Costa Rica (Pymexpress)
- Cotizar por peso y distrito, generar guía y número de rastreo, consultar estado.
- El acceso al Web Service lo da Correos; probablemente **cada comercio** necesita sus credenciales. Confirmar con
  Correos.

## 9. Estructura del repo (propuesta)

```
spora/
├─ apps/
│  ├─ backend/        ← Vendure + plugins de Spora
│  ├─ storefront/     ← Hono + SibuJS SSR: todas las tiendas (multi-tenant)
│  └─ marketplace/    ← Hono + SibuJS SSR: spora.cr
├─ packages/
│  ├─ ui/             ← componentes (sobre sibujs-ui)
│  ├─ themes/         ← estilos y tokens
│  ├─ api-client/     ← cliente tipado de Vendure (sin dependencia de SibuJS)
│  └─ shared/         ← schemas Zod, nomenclátor, monedas, utilidades
└─ docs/
```

Monorepo pnpm + Turborepo, TypeScript estricto (igual que TrackingApp).

## 10. Fases

### Fase 0 — Prueba de SibuJS (antes de comprometerse)
Una ficha de producto con SSR + islas (galería, selector de variantes, agregar al carrito) servida por Hono, leyendo
de un Vendure local, con dos estilos distintos. Criterio de éxito: HTML completo sin JS, hidratación sin parpadeo,
cambio de estilo sin tocar componentes. Si falla, se evalúa Astro o Next.js manteniendo el resto del plan.

### Fase 1 — Una tienda que vende
Vendure con canales y multi-vendor, alta de comercio, catálogo con variantes, carrito, checkout, contra entrega y
SINPE, Cuenta Spora, estilos `suave` y `minimal`.

### Fase 2 — Marketplace
spora.cr con Meilisearch, categorías globales, marcas curadas, atributos comunes, páginas de tienda.

### Fase 3 — Pagos y envíos completos
Transferencia, PayPal, Tilopay, CRC/USD con BCCR, envío propio por zonas, TrackingApp, Correos.

### Fase 4 — Comisiones
Acuerdos por comercio, movimientos, panel en tiempo real, factura mensual, admin de Spora.

### Fase 5 — Crecimiento
Los 5 estilos, dominio propio, aprobación de tiendas, reportes.

## 11. Preguntas abiertas
- ¿Registro libre de tiendas o revisión manual?
- Contra entrega en USD con TrackingApp (`codAmount` sin moneda).
- Credenciales de Correos: ¿por comercio o una cuenta de Spora?
- Factura electrónica de Hacienda para las facturas de comisión (¿desde cuándo?).
