# 0003 — Comisión: factura mensual sobre pedidos registrados, basada en confianza

- Estado: aceptada (2026-11-13). Actualizada el 2026-11-19 (correcciones post-MVP): base sin IVA, confirmación de
  entrega por el cliente, disputas y cierre con días de gracia.

## Contexto
El dinero va directo al comercio (SINPE, transferencia, contra entrega). Spora no puede descontar la comisión en el
pago. Opciones: facturar al mes, crédito prepago, o cobrar solo con split en pasarela.

## Decisión
Factura mensual sobre los pedidos registrados en Spora. La confianza es parte del gancho comercial.

## Detalles
- Porcentaje negociado por comercio, con historial de vigencias; cada movimiento guarda copia del vigente.
- **Base: el subtotal de productos sin IVA ni envío** (`order.subTotal`), en la moneda en que entró el dinero. El IVA
  es de Hacienda, no del comercio. Los movimientos anteriores a este cambio (base con IVA) no se recalculan: quedan
  marcados y el estado de cuenta lo dice.
- Se vuelve facturable cuando el pedido se **entrega**; se anula si se cancela o devuelve. La entrega la reporta el
  transportista (webhook), la tienda (Admin UI) o **el cliente** desde su Cuenta Spora ("¿Recibiste tu pedido?"),
  todos por el mismo servicio.
- **Disputa:** si el cliente dice "No lo recibí", el movimiento queda **en disputa**: no se factura (ni al cierre) y
  sale en la lista "Pedidos en disputa" del admin de Spora.
- **Cierre con días de gracia:** un pedido que nadie marca como entregado no puede quedar pendiente para siempre. Al
  cerrar el mes, lo pendiente sin cancelar ni en disputa hecho hace `SPORA_DIAS_GRACIA_CIERRE` días o más (7 por
  defecto, hora de Costa Rica) se factura igual, marcado "facturado al cierre sin confirmar entrega"; lo más nuevo
  espera al cierre siguiente. El comercio ve en su panel qué se facturará al cierre y desde cuándo, para entregarlo
  o cancelarlo antes.
- Factura por moneda de la venta (subtotales CRC y USD).
- El comercio ve su comisión acumulada en tiempo real.

## Consecuencias
- Riesgo de pedidos fuera de la plataforma o impagos: se acepta; se mide y se revisa más adelante.
- Con el cierre por días de gracia, un comercio que no marca sus entregas paga igual a los 7 días: el incentivo es
  marcar entregas y cancelaciones a tiempo. Un pedido que el cliente disputa no se cobra hasta resolverlo (hoy lo
  resuelve a mano el admin de Spora).
