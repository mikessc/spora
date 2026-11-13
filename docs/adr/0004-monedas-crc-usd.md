# 0004 — Monedas: CRC y USD con un precio base y conversión BCCR

- Estado: aceptada (2026-11-13)

## Contexto
Muchas pymes publican en dólares. Fijar dos precios a mano duplica trabajo por variante y se desfasa con el tipo de
cambio. Además, los métodos de pago imponen moneda: SINPE Móvil en colones, PayPal en dólares.

## Decisión
- La tienda elige su moneda base y pone un precio por variante.
- Conversión al tipo de cambio de venta del BCCR (una vez al día) para mostrar y para cobrar cuando el método lo exige.
- Opción avanzada: precio manual en la otra moneda.
- El pedido guarda moneda, monto y tipo de cambio.
- La comisión se factura en la moneda en que entró el dinero.
