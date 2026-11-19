import { LanguageCode, PaymentMethodHandler } from "@vendure/core";

/** Contra entrega (PLAN §4): el pago queda autorizado al confirmar y se liquida cuando se entrega el pedido. */
export const cashOnDeliveryHandler = new PaymentMethodHandler({
  code: "contra-entrega",
  description: [{ languageCode: LanguageCode.es, value: "Contra entrega" }],
  args: {},
  createPayment: (_ctx, _order, amount) => ({
    amount,
    state: "Authorized" as const,
    metadata: { public: { instrucciones: "Pague al recibir su pedido." } },
  }),
  settlePayment: () => ({ success: true }),
});
