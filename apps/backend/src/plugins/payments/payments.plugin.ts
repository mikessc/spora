import { Readable } from "node:stream";
import { Controller, Get, Inject, Injectable, Query as HttpQuery, Res } from "@nestjs/common";
import { Args, Mutation, Resolver } from "@nestjs/graphql";
import {
  Asset,
  AssetService,
  ConfigService,
  Ctx,
  defaultPaymentProcess,
  ForbiddenError,
  idsAreEqual,
  LanguageCode,
  Order,
  OrderService,
  PaymentMethod,
  PaymentService,
  PluginCommonModule,
  type RequestContext,
  Transaction,
  TransactionalConnection,
  UserInputError,
  VendurePlugin,
} from "@vendure/core";
import type { Response } from "express";
import gql from "graphql-tag";
import { gatewayFor, sign, validSignature } from "./gateways";
import { awaitingGatewayProcess, paymentHandlers } from "./handlers";
import { PaymentMethodSecrets } from "./secrets";

declare module "@vendure/core/dist/entity/custom-entity-fields" {
  interface CustomOrderFields {
    paymentReceipt: Asset | null;
  }
}

const es = (value: string) => [{ languageCode: LanguageCode.es, value }];
const RECEIPT_TYPES = /^(image\/(png|jpeg|webp|gif)|application\/pdf)$/;
const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;

@Injectable()
export class PaymentCompletionService {
  constructor(
    @Inject(TransactionalConnection) private connection: TransactionalConnection,
    @Inject(OrderService) private orders: OrderService,
    @Inject(PaymentService) private payments: PaymentService,
    @Inject(ConfigService) private config: ConfigService,
    @Inject(AssetService) private assets: AssetService,
  ) {}

  /**
   * El pedido por código, solo si quien pregunta puede verlo: es el pedido activo de su sesión (todavía esperando a la
   * pasarela), o lo permite la estrategia de Vendure (dueño, o la misma sesión poco después de confirmarlo).
   */
  private async accessibleOrder(ctx: RequestContext, code: string) {
    const order = await this.orders.findOneByCode(ctx, code, ["payments", "customer"]);
    if (!order) throw new ForbiddenError();
    const ownSession = ctx.session?.activeOrderId != null && idsAreEqual(ctx.session.activeOrderId, order.id);
    const strategy = this.config.orderOptions.orderByCodeAccessStrategy;
    if (!ownSession && !(await strategy.canAccessOrder(ctx, order))) throw new ForbiddenError();
    return order;
  }

  /**
   * Vuelta de una pasarela: se confirma con la pasarela misma y se liquida el pago. Idempotente: si el pago ya está
   * liquidado no hace nada (el cliente puede recargar la página de retorno).
   */
  async completeExternal(ctx: RequestContext, code: string, params: Record<string, string>) {
    const order = await this.accessibleOrder(ctx, code);
    const payment = [...order.payments]
      .filter((p) => p.state === "EnPasarela" || p.state === "Settled")
      .sort((a, b) => Number(b.id) - Number(a.id))[0];
    if (!payment || payment.state === "Settled") return order;

    const method = await this.connection.getRepository(ctx, PaymentMethod).findOneByOrFail({ code: payment.method });
    const provider = method.handler.code;
    if (provider !== "paypal" && provider !== "tilopay") throw new UserInputError("Ese pago no es de una pasarela");
    const args = Object.fromEntries(method.handler.args.map((a) => [a.name, a.value]));
    const cobro = payment.metadata.cobro as { amount: number; currency: "CRC" | "USD" };
    const { approved } = await gatewayFor(provider).verify(payment.transactionId, params, args, {
      ...cobro,
      orderCode: order.code,
    });
    if (approved) await this.orders.settlePayment(ctx, payment.id);
    else await this.payments.transitionToState(ctx, payment.id, "Declined");
    return this.orders.findOne(ctx, order.id);
  }

  /** Comprobante de SINPE o transferencia: queda en el pedido para que la tienda lo revise y liquide el pago. */
  async attachReceipt(ctx: RequestContext, code: string, file: { name: string; type: string; base64: string }) {
    const order = await this.accessibleOrder(ctx, code);
    const data = Buffer.from(file.base64, "base64");
    if (!RECEIPT_TYPES.test(file.type)) throw new UserInputError("El comprobante debe ser una imagen o un PDF");
    if (!data.length || data.length > RECEIPT_MAX_BYTES) throw new UserInputError("El comprobante pesa más de 5 MB");
    const asset = await this.assets.create(ctx, {
      file: {
        filename: `comprobante-${order.code}-${file.name.replace(/[^\w.-]/g, "_")}`,
        mimetype: file.type,
        encoding: "7bit",
        createReadStream: () => Readable.from(data),
      },
    });
    if (!("id" in asset)) throw new UserInputError(asset.message);
    // update() y no save(): guardar un Order sin sus líneas dispara cálculos de Vendure que las necesitan.
    await this.connection
      .getRepository(ctx, Order)
      .update({ id: order.id }, { customFields: { paymentReceipt: { id: asset.id } } } as never);
    return true;
  }
}

@Resolver()
class PaymentShopResolver {
  constructor(@Inject(PaymentCompletionService) private completion: PaymentCompletionService) {}

  @Mutation()
  @Transaction()
  completeExternalPayment(
    @Ctx() ctx: RequestContext,
    @Args("orderCode") code: string,
    @Args("params") params: Record<string, string>,
  ) {
    return this.completion.completeExternal(ctx, code, params ?? {});
  }

  @Mutation()
  @Transaction()
  submitPaymentReceipt(
    @Ctx() ctx: RequestContext,
    @Args("orderCode") code: string,
    @Args("input") input: { name: string; type: string; base64: string },
  ) {
    return this.completion.attachReceipt(ctx, code, input);
  }
}

/** "Pasarela" simulada para probar PayPal y Tilopay sin credenciales. */
@Controller("pagos-simulados")
class SimulatedGatewayController {
  @Get()
  page(@HttpQuery() q: Record<string, string>, @Res() res: Response) {
    const back = q.volver ?? "";
    if (!q.ref || !validSignature(`${q.ref}|${back}`, q.firma)) {
      res.status(400).send("Enlace de pago inválido");
      return;
    }
    const link = (estado: string) => {
      const url = new URL(back);
      url.searchParams.set("ref", q.ref!);
      url.searchParams.set("estado", estado);
      url.searchParams.set("firma", sign(`${q.ref}|${estado}`));
      return url.toString().replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    };
    const esc = (s = "") => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
    res.type("html")
      .send(`<!doctype html><html lang="es-CR"><head><meta charset="utf-8"><title>Pasarela simulada</title>
<style>body{font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem}a{display:inline-block;margin:.5rem .5rem 0 0;padding:.7rem 1.2rem;border:1px solid;border-radius:.5rem;text-decoration:none}</style></head>
<body><h1>${esc(q.proveedor === "paypal" ? "PayPal" : "Tilopay")} (simulado)</h1>
<p>Pedido <strong>${esc(q.pedido)}</strong>: <strong>${esc(q.monto)}</strong></p>
<p>Esta página reemplaza a la pasarela real en local (MVP.md). Elija el resultado:</p>
<a class="aprobar" href="${link("aprobado")}">Aprobar el pago</a><a class="rechazar" href="${link("rechazado")}">Rechazar</a>
</body></html>`);
  }
}

/** Pagos (PLAN §4, M4): proveedores, credenciales cifradas, pasarelas con retorno y comprobantes. */
@VendurePlugin({
  imports: [PluginCommonModule],
  providers: [PaymentCompletionService],
  controllers: [SimulatedGatewayController],
  shopApiExtensions: {
    schema: gql`
      input PaymentReceiptInput {
        name: String!
        type: String!
        "Archivo en base64 (imagen o PDF, máximo 5 MB)."
        base64: String!
      }
      extend type Mutation {
        "Vuelta de PayPal o Tilopay: confirma con la pasarela y liquida el pago. Idempotente."
        completeExternalPayment(orderCode: String!, params: JSON!): Order!
        "Comprobante de SINPE Móvil o transferencia."
        submitPaymentReceipt(orderCode: String!, input: PaymentReceiptInput!): Boolean!
      }
    `,
    resolvers: [PaymentShopResolver],
  },
  configuration: (config) => {
    config.paymentOptions.paymentMethodHandlers.push(...paymentHandlers);
    config.paymentOptions.process = [
      ...(config.paymentOptions.process ?? [defaultPaymentProcess]),
      awaitingGatewayProcess,
    ];
    config.dbConnectionOptions = {
      ...config.dbConnectionOptions,
      subscribers: [...((config.dbConnectionOptions.subscribers as []) ?? []), PaymentMethodSecrets],
    };
    config.customFields.Order.push({
      name: "paymentReceipt",
      type: "relation",
      entity: Asset,
      nullable: true,
      label: es("Comprobante de pago"),
      description: es("Lo sube el cliente (SINPE o transferencia). Revíselo y liquide el pago."),
    });
    return config;
  },
  compatibility: "^3.0.0",
})
export class PaymentsPlugin {}
