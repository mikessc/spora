import { type ID, type RequestContext, VendureEvent } from "@vendure/core";

/** El cliente dijo que no recibió su pedido: queda en disputa y su comisión no se factura hasta resolverlo. */
export class DeliveryDisputeEvent extends VendureEvent {
  constructor(
    public ctx: RequestContext,
    public orderId: ID,
  ) {
    super();
  }
}
