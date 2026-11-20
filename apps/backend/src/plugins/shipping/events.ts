import { type ID, type RequestContext, VendureEvent } from "@vendure/core";

/** El admin de Spora resolvió una disputa: se entregó (la comisión se factura) o no (se anula). */
export class DeliveryDisputeResolvedEvent extends VendureEvent {
  constructor(
    public ctx: RequestContext,
    public orderId: ID,
    public delivered: boolean,
  ) {
    super();
  }
}

/** El cliente dijo que no recibió su pedido: queda en disputa y su comisión no se factura hasta resolverlo. */
export class DeliveryDisputeEvent extends VendureEvent {
  constructor(
    public ctx: RequestContext,
    public orderId: ID,
  ) {
    super();
  }
}
