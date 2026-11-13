# 0006 — Envíos: proveedores con interfaz común; TrackingApp y Correos

- Estado: aceptada (2026-11-13)

## Decisión
Interfaz de proveedor de envío: cotizar → crear guía → recibir estados. Cada tienda activa los suyos: envío propio
(tarifas por zona), retiro en local, Correos de Costa Rica (Pymexpress) y TrackingApp.

## TrackingApp
Producto propio de Mike (`mikessc/TrackingApp`). La tienda es un `client` de una empresa de logística en TrackingApp y
pega su llave de cliente en Spora. Spora crea el envío con `POST /v1/shipments` (`Idempotency-Key` por pedido,
`codAmount` para contra entrega) y escucha webhooks firmados (`package.delivered` → pedido entregado → comisión
facturable). Se usa el mismo nomenclátor de direcciones. Detalle en PLAN §8.1.

## Pendientes
- TrackingApp: endpoint `/v1/webhooks` para que Spora registre su webhook sola.
- TrackingApp: moneda de `codAmount` para pedidos en USD.
- Correos: confirmar si las credenciales del Web Service son por comercio.
