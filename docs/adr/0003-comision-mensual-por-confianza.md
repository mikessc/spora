# 0003 — Comisión: factura mensual sobre pedidos registrados, basada en confianza

- Estado: aceptada (2026-11-13)

## Contexto
El dinero va directo al comercio (SINPE, transferencia, contra entrega). Spora no puede descontar la comisión en el
pago. Opciones: facturar al mes, crédito prepago, o cobrar solo con split en pasarela.

## Decisión
Factura mensual sobre los pedidos registrados en Spora. La confianza es parte del gancho comercial.

## Detalles
- Porcentaje negociado por comercio, con historial de vigencias; cada movimiento guarda copia del vigente.
- Se vuelve facturable cuando el pedido se **entrega**; se anula si se cancela o devuelve.
- Factura por moneda de la venta (subtotales CRC y USD).
- El comercio ve su comisión acumulada en tiempo real.

## Consecuencias
- Riesgo de pedidos fuera de la plataforma o impagos: se acepta; se mide y se revisa más adelante.
