# Spora — marketplace de tiendas para pymes

Tiendas gratis para pymes de Costa Rica; Spora gana por comisión. Plan: [docs/PLAN.md](docs/PLAN.md). Ejecución del
MVP: [docs/MVP.md](docs/MVP.md) (manda sobre el orden de trabajo). Estado:
[docs/PROGRESO.md](docs/PROGRESO.md). Decisiones: [docs/adr/](docs/adr/).

## Stack
- Monorepo pnpm + Turborepo, TypeScript estricto.
- Backend: **Vendure** (headless). Cada tienda es un canal (`Channel`). Plugins propios en `apps/backend/src/plugins`.
- Front: **SibuJS** con SSR + islas, servido por **Hono**. Componentes en `@spora/ui` (sobre sibujs-ui), estilos en
  `@spora/themes`.
- Búsqueda del marketplace: Meilisearch. Base de datos: PostgreSQL.
- SibuJS es poco conocido: antes de escribir código de front, leer su documentación (sibujs.dev, repo
  `hexplus/sibujs`). No asumir APIs de React, Solid ni Vue.

## Reglas
- Idioma: UI y docs en español (es-CR). Código con los nombres del glosario (PLAN §1): `seller`, `store`, `customer`,
  `order`, `commissionEntry`…
- Los componentes **nunca** llevan colores, radios, sombras ni tipografías fijas: solo variables de `@spora/themes`.
- `@spora/api-client` y `@spora/shared` no dependen de SibuJS.
- Dinero: montos en enteros de la unidad menor (céntimos/centavos) y siempre con su moneda (`CRC` | `USD`). Nunca
  `number` flotante para dinero.
- Todo pedido guarda moneda, monto y tipo de cambio usados. Todo `commissionEntry` guarda copia del porcentaje vigente.
- Pagos y envíos son proveedores con interfaz común: agregar uno nuevo no toca el checkout.
- Credenciales de comercios (SINPE, IBAN, Tilopay, PayPal, Correos, TrackingApp) cifradas en el servidor; nunca en el
  front. Nunca commitear `.env`.
- Direcciones con el nomenclátor de Costa Rica compartido con TrackingApp.
- Fechas de negocio ("hoy", el mes de facturación) en zona `America/Costa_Rica`, nunca UTC ni la del navegador.
- Webhooks entrantes: verificar firma y procesar de forma idempotente por id de evento.
