# Prueba del MVP

Recorrido de punta a punta para revisar el MVP en local, como cliente, como comercio y como admin de Spora. Cada paso
dice qué abrir, con qué usuario y qué debería ver. Toma unos 30 minutos.

Lo mismo, automatizado, está en `pnpm e2e` (25 recorridos en Chrome).

## 0. Arrancar desde cero
Requisitos: Node ≥ 22.3, pnpm 9 y Docker Desktop abierto.

```sh
docker compose up -d && pnpm install && pnpm seed && pnpm dev
```

- `pnpm seed` tarda alrededor de un minuto. Debe terminar con:
  `Cliente de prueba: cliente@spora.localhost / cliente1234 (5 pedidos)`.
- `pnpm dev` está listo cuando Vendure dice `now running on port 3000`.
- Para volver a empezar: `pnpm db:reset && pnpm seed`.

## Usuarios

| Quién | Usuario | Clave | Dónde |
| --- | --- | --- | --- |
| Admin de Spora | `superadmin` | `superadmin` | <http://localhost:3000/dashboard> |
| Tienda Demo (moda, CRC, 8 %) | `demo@spora.localhost` | `demo1234` | <http://localhost:3000/dashboard> |
| Café Sur (café, USD, 6 %) | `cafe@spora.localhost` | `cafe1234` | <http://localhost:3000/dashboard> |
| Barro y Telar (artesanía, CRC, 10 %) | `barro@spora.localhost` | `barro1234` | <http://localhost:3000/dashboard> |
| Voltio (tecnología, USD, 5 %) | `voltio@spora.localhost` | `voltio1234` | <http://localhost:3000/dashboard> |
| Cliente con pedidos | `cliente@spora.localhost` | `cliente1234` | cualquier tienda o el marketplace |

Las tiendas viven en `http://<tienda>.spora.localhost:4000` y el marketplace en <http://spora.localhost:5000>.

## 1. Marketplace
1. Abra <http://spora.localhost:5000/>.
   - **Debe ver** la portada "Las tiendas de Costa Rica" con las 4 tiendas.
2. Busque `taza`.
   - **Debe ver** "Taza de Barro", de Barro y Telar, en colones.
3. Abra <http://spora.localhost:5000/buscar?color=rojo>.
   - **Debe ver** 5 productos de 3 tiendas: Bolso Tejido, Camiseta Sibú, Funda de Silicona, Gorra Sibú y Pañuelo Tucán.
   - Al marcar otro color, las demás opciones del grupo no desaparecen (facetas disyuntivas).
4. Filtre por moneda **USD**.
   - **Debe ver** solo productos de Café Sur y Voltio, con el precio en dólares y "≈ ₡…" al lado.
5. Entre a **Categorías → Artesanía**.
   - **Debe ver** los 10 productos de Barro y Telar.
   - Al hacer clic en uno, lo lleva a la ficha **en la tienda** (`barro-telar.spora.localhost:4000/producto/…`).

## 2. Las cuatro tiendas, cada una con su estilo
Abra cada portada:
- <http://tienda-demo.spora.localhost:4000/> (estilo **suave**)
- <http://cafe-sur.spora.localhost:4000/> (**editorial**)
- <http://barro-telar.spora.localhost:4000/> (**pop**)
- <http://voltio.spora.localhost:4000/> (**minimal**)

**Debe ver:**
- Mismo diseño de página con formas, color y tipografía distintos.
- Los productos de la tienda y sus categorías propias (por ejemplo Hombre / Mujer / Accesorios en Tienda Demo).
- Filtros por talla, color, tamaño o capacidad, según el catálogo.
- En Café Sur y Voltio, precios en dólares con el aproximado en colones al tipo de cambio del día (₡515 simulado).

En <http://tienda-demo.spora.localhost:4000/producto/camiseta-sibu>:
- Al elegir **Azul**, cambia la galería.
- Con **L**, sube el precio a ₡13 500 y dice "Agotado".
- Agregar al carrito suma en el contador del encabezado sin recargar.
- Agregue `?estilo=pop` (o `vibrante`, `minimal`, `editorial`) a cualquier página: cambia el estilo, no el contenido.

## 3. Cuenta Spora del cliente de prueba
1. En cualquier tienda: **Ingresar** con `cliente@spora.localhost` / `cliente1234`.
2. Abra **Mi cuenta**. **Debe ver** 5 pedidos de 4 tiendas en un solo historial:

   | Tienda | Producto | Envío y pago | Estado |
   | --- | --- | --- | --- |
   | Tienda Demo | Camiseta Sibú | Mensajería con rastreo, contra entrega | **Entregado** (guía `SIM-…` · Entregado) |
   | Voltio | Audífonos Inalámbricos | Correos, contra entrega | **Enviado** (guía de Correos · En camino) |
   | Barro y Telar | Taza de Barro | Retiro en local, SINPE Móvil | **Confirmado** (falta el comprobante) |
   | Café Sur | Café Tarrazú | Envío a domicilio, transferencia | **Confirmado** (falta el comprobante) |
   | Tienda Demo | Gorra Sibú | Envío a domicilio, contra entrega | **Cancelado** (el paquete se devolvió) |

3. **¿Recibiste tu pedido?**: debajo de los pedidos enviados sin entregar (Voltio) y de los de retiro (Barro y Telar)
   aparece la pregunta con dos botones. Funciona también sin JavaScript.
   - **"Sí, lo recibí"** en la Taza de Barro: el pedido pasa a **Entregado** y su comisión a facturable.
   - **"No lo recibí"** en los Audífonos: queda el aviso "Nos dijo que no recibió el pedido…" y el pedido pasa a
     **en disputa** (paso 6).
4. Pase a otra tienda o al marketplace.
   - **Debe seguir** con la sesión iniciada: una sola cuenta para todo Spora.
   - Las tiendas solo la ven entre sus clientes (Panel Spora → Clientes) si ya les compró: visitar o llenar el carrito
     no comparte sus datos.

## 4. Comprar en cada tienda
Use una ventana privada para comprar sin cuenta, o siga con el cliente de prueba.

| Tienda | Qué comprar | Envío | Pago | Debe ver |
| --- | --- | --- | --- | --- |
| Barro y Telar | Plato Hondo | Correos de Costa Rica (₡2 300 a Escazú) | SINPE Móvil | "Haga un SINPE Móvil por ₡14 300 al 8777-1111 (Barro y Telar)" y un campo para subir el comprobante |
| Voltio | Cargador USB-C 20 W ($18) | Mensajería con rastreo ($4) | Tarjeta | La pasarela simulada de Tilopay. "Aprobar" vuelve a la tienda con el pedido **Pagado** por $22 |
| Tienda Demo | Camiseta Volcán | Retiro en local | PayPal | La pasarela simulada de PayPal cobra en **dólares** al tipo de cambio. "Rechazar" lo devuelve al pago con un aviso |
| Café Sur | Café Tarrazú | Envío a domicilio | Contra entrega | Pedido **Confirmado** en dólares con el tipo de cambio guardado ("₡515.00 por dólar") |

**Notas:**
- En el paso de datos, la dirección se elige del nomenclátor: provincia, cantón y distrito, con su código postal.
- Todo funciona también sin JavaScript (desactívelo en el navegador): la ficha, los filtros, el carrito y el checkout
  se envían como formularios.

## 5. El comercio atiende el pedido (Barro y Telar)
1. <http://localhost:3000/dashboard>: ingrese como `barro@spora.localhost` / `barro1234`.
   - **Debe ver** solo su tienda: pedidos, productos y configuración de Barro y Telar, nada de las otras.
2. **Pedidos** → el pedido del Plato Hondo.
   - En "Comprobante de pago" **debe ver** la imagen que subió el cliente.
   - Liquide el pago: el pedido pasa a **Pagado**.
3. **Preparar envío** con Correos.
   - **Debe ver** una guía simulada.
4. Para avanzar el rastreo sin transportista real, abra <http://localhost:3000/admin-api> (misma sesión del Panel Spora).
   1. Agregue el header `{"vendure-token": "barro-telar"}`.
   2. Busque el id del envío:
      ```graphql
      { orders(options: { sort: { createdAt: DESC }, take: 1 }) { items { code fulfillments { id } } } }
      ```
   3. Marque el envío en camino y luego entregado:
      ```graphql
      mutation { simulateShipmentEvent(fulfillmentId: "<id>", event: "en_camino") }
      mutation { simulateShipmentEvent(fulfillmentId: "<id>", event: "entregado") }
      ```
   - **Debe ver** el pedido **Entregado**, en el Panel Spora y en la cuenta del cliente.
   - Con `devuelto`, el pedido se cancela y la contra entrega no se cobra.
   - En tiendas con "Mensajería con rastreo" (TrackingApp), cada evento llega como **webhook firmado** al endpoint de la
     tienda, igual que en producción.

**Otras pantallas del comercio en el Panel Spora:**
- **Mi tienda** (menú lateral): estilo, color, tipografía, logo, textos, políticas y credenciales de TrackingApp. Al
  guardar, la tienda cambia enseguida.
- **Configuración → Métodos de pago / de envío**: cada proveedor y sus credenciales, que se guardan cifradas.

## 6. Comisiones
1. Panel Spora → **Comisiones**, como `demo@spora.localhost`.
   - **Debe ver** el mes en curso de Tienda Demo:
     - la Camiseta Sibú del cliente de prueba como **facturable**, al 8 %;
     - la Gorra devuelta como **anulada**;
     - lo que compró en el paso 4 como **pendiente**.
   - **"Se facturarán al cierre sin confirmar entrega"**: los pendientes, con la fecha desde la que el cierre de mes los
     factura igual (7 días después del pedido, `SPORA_DIAS_GRACIA_CIERRE`). Si ya los entregó, márquelos entregados;
     si no, cancélelos.
   - Totales por moneda; **CSV** descarga el estado de cuenta e **Imprimir** sirve para el PDF. La base dice
     **sin IVA**.
2. Después de entregar el Plato Hondo (paso 5), entre como `barro@spora.localhost`.
   - **Debe ver** ese pedido **facturable** al 10 %, solo sobre los productos, **sin IVA ni envío** (el IVA es de Hacienda, no del comercio).
3. Ingrese como `superadmin`.
   - **Debe ver** todas las tiendas y sus acuerdos, con el porcentaje vigente editable desde una fecha.
   - **"Pedidos en disputa"**: los Audífonos de Voltio si el cliente dijo que no los recibió (paso 3). No se facturan.
   - **Cerrar el mes**: lo pendiente con 7 días o más (y sin cancelar ni en disputa) pasa a facturable con la marca
     "facturado al cierre sin confirmar entrega"; después todo lo facturable se agrupa por tienda y moneda y queda
     **facturado**.

## 7. Lo que hace el admin de Spora
Como `superadmin` en el Panel Spora y en la Admin API:
- **Vendedores**: cada tienda con su estado. Pasar una tienda a `suspendido` hace que su dominio responda 403 y que
  sus productos salgan del marketplace.
- **Spora → Marcas**: la marca "Artesanías del Sur" está **propuesta** y no aparece en el marketplace hasta
  aprobarla. Desde ahí se aprueba, se rechaza (los productos que la usaban quedan sin marca) o se fusiona con un
  duplicado.
- En un producto (como comercio), **Categoría global** y **Marca** se eligen de una lista con búsqueda; escriba una
  marca que no existe y aparece "Proponer la marca «…»".
- **Alta de un comercio nuevo**: mutation `registerStore`. Crea canal, bodega, rol, usuario y los métodos de siempre
  (envío a domicilio, retiro y contra entrega).

## Qué es simulado
PayPal, Tilopay, Correos, TrackingApp y el tipo de cambio del BCCR usan adaptadores simulados por defecto. Los reales
se activan con variables de entorno: ver [LOCAL.md](LOCAL.md) y `apps/backend/.env.example`.
