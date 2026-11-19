import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Controller, Headers, HttpCode, Inject, Injectable, Param, Post, Req, Res } from "@nestjs/common";
import { Args, Mutation, Resolver } from "@nestjs/graphql";
import {
  Allow,
  Channel,
  Ctx,
  type DeepPartial,
  Fulfillment,
  LanguageCode,
  Order,
  type OrderProcess,
  OrderService,
  Permission,
  PluginCommonModule,
  type RequestContext,
  RequestContextService,
  Transaction,
  TransactionalConnection,
  UserInputError,
  VendureEntity,
  VendurePlugin,
} from "@vendure/core";
import { type Request, type Response, raw } from "express";
import gql from "graphql-tag";
import {
  Column,
  Entity,
  type EntitySubscriberInterface,
  EventSubscriber,
  Index,
  type InsertEvent,
  type UpdateEvent,
} from "typeorm";
import { decrypt, encrypt } from "../payments/secrets";
import { correosCalculator, correosFulfillment, trackingAppFulfillment, zoneRateCalculator } from "./providers";

declare module "@vendure/core/dist/entity/custom-entity-fields" {
  interface CustomFulfillmentFields {
    provider: string | null;
    externalId: string | null;
    trackingUrl: string | null;
    trackingStatus: string | null;
  }
  interface CustomProductVariantFields {
    weightGrams: number | null;
  }
  interface CustomChannelFields {
    trackingAppKey: string | null;
    trackingAppWebhookSecret: string | null;
  }
}

const es = (value: string) => [{ languageCode: LanguageCode.es, value }];

/** Eventos de envío ya procesados: los webhooks se procesan una sola vez por id de evento (CLAUDE.md). */
@Entity()
@Index(["provider", "eventId"], { unique: true })
export class ShipmentEvent extends VendureEntity {
  constructor(input?: DeepPartial<ShipmentEvent>) {
    super(input);
  }
  @Column("varchar") provider!: string;
  @Column("varchar") eventId!: string;
  @Column("varchar") kind!: string;
}

/** Lo que pasó con un paquete, ya sin el formato de cada proveedor. */
export type ShipmentEventKind = "estado" | "en_camino" | "entregado" | "devuelto" | "cancelado";

/** Llave y secreto de TrackingApp de cada tienda: cifrados en la base, en claro para los servicios. */
@EventSubscriber()
export class ChannelSecrets implements EntitySubscriberInterface<Channel> {
  listenTo() {
    return Channel;
  }
  private map(channel: Partial<Channel> | undefined, fn: (v: string) => string) {
    const fields = channel?.customFields as Record<string, unknown> | undefined;
    for (const name of ["trackingAppKey", "trackingAppWebhookSecret"]) {
      if (fields && typeof fields[name] === "string" && fields[name]) fields[name] = fn(fields[name] as string);
    }
  }
  beforeInsert(e: InsertEvent<Channel>) {
    this.map(e.entity, encrypt);
  }
  beforeUpdate(e: UpdateEvent<Channel>) {
    this.map(e.entity as Channel, encrypt);
  }
  afterInsert(e: InsertEvent<Channel>) {
    this.map(e.entity, decrypt);
  }
  afterUpdate(e: UpdateEvent<Channel>) {
    this.map(e.entity as Channel, decrypt);
  }
  afterLoad(channel: Channel) {
    this.map(channel, decrypt);
  }
}

/** Contra entrega: el pedido se envía con el pago solo autorizado (se cobra al entregar). */
const shipBeforeSettling: OrderProcess<never> = {
  transitions: {
    PaymentAuthorized: {
      to: ["PartiallyShipped", "Shipped", "PartiallyDelivered", "Delivered"],
      mergeStrategy: "merge",
    },
  },
};

@Injectable()
export class ShipmentEventsService {
  constructor(
    @Inject(TransactionalConnection) private connection: TransactionalConnection,
    @Inject(OrderService) private orders: OrderService,
  ) {}

  /**
   * Aplica un evento a la guía y al pedido. Idempotente por (proveedor, id de evento): un webhook repetido no hace nada.
   * Entregado → pedido entregado (y se liquida la contra entrega); devuelto o cancelado → pedido cancelado.
   */
  async apply(
    ctx: RequestContext,
    event: {
      provider: string;
      eventId: string;
      kind: ShipmentEventKind;
      status: string;
      fulfillmentId: string | number;
    },
  ): Promise<"aplicado" | "repetido"> {
    const events = this.connection.getRepository(ctx, ShipmentEvent);
    if (await events.existsBy({ provider: event.provider, eventId: event.eventId })) return "repetido";
    await events.save(new ShipmentEvent({ provider: event.provider, eventId: event.eventId, kind: event.kind }));

    const fulfillments = this.connection.getRepository(ctx, Fulfillment);
    const fulfillment = await fulfillments.findOneByOrFail({ id: event.fulfillmentId });
    await fulfillments.update({ id: fulfillment.id }, { customFields: { trackingStatus: event.status } } as never);
    const order = await this.connection
      .getRepository(ctx, Order)
      .createQueryBuilder("order")
      .innerJoin("order.fulfillments", "fulfillment", "fulfillment.id = :id", { id: fulfillment.id })
      .leftJoinAndSelect("order.payments", "payment")
      .getOneOrFail();

    const to = async (state: "Shipped" | "Delivered" | "Cancelled") => {
      const result = await this.orders.transitionFulfillmentToState(ctx, fulfillment.id, state);
      if ("errorCode" in result) throw new UserInputError(result.message);
    };
    if ((event.kind === "en_camino" || event.kind === "entregado") && fulfillment.state === "Pending")
      await to("Shipped");
    if (event.kind === "entregado") {
      await to("Delivered");
      for (const payment of order.payments.filter(
        (p) => p.state === "Authorized" && p.method.endsWith("-contra-entrega"),
      )) {
        await this.orders.settlePayment(ctx, payment.id);
      }
    }
    if (event.kind === "devuelto" || event.kind === "cancelado") {
      if (fulfillment.state !== "Cancelled") await to("Cancelled");
      const cancelled = await this.orders.transitionToState(ctx, order.id, "Cancelled");
      if ("errorCode" in cancelled) throw new UserInputError(cancelled.message);
    }
    return "aplicado";
  }
}

// ── TrackingApp: webhooks firmados (PLAN §8.1) ───────────────────────────────────────────────────────────────────

const TRACKINGAPP_STATUS: Record<string, string> = {
  registrado: "Registrado",
  en_proceso: "En proceso",
  en_transito: "En tránsito",
  en_ruta_entrega: "En ruta de entrega",
  reprogramado: "Reprogramado",
  entregado: "Entregado",
  excepcion: "Excepción",
  devuelto: "Devuelto",
  cancelado: "Cancelado",
};

/** `t=<unix>,v1=<hex>`: HMAC-SHA256 de `"<t>.<cuerpo>"` (estilo Stripe). Rechaza firmas de más de 5 minutos. */
export function verifyTrackingAppSignature(header: string, body: Buffer, secret: string, now = Date.now()): boolean {
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || !parts.v1 || Math.abs(now / 1000 - t) > 300) return false;
  const expected = createHmac("sha256", secret)
    .update(`${t}.${body.toString("utf8")}`)
    .digest("hex");
  return parts.v1.length === expected.length && timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected));
}

export function signTrackingAppWebhook(body: string, secret: string, at = Date.now()): string {
  const t = Math.floor(at / 1000);
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
}

interface TrackingAppPayload {
  id: string;
  type: string;
  data: { package?: { id: string; status: string; trackingNumber: string }; to?: string };
}

function kindOf(payload: TrackingAppPayload): ShipmentEventKind {
  if (payload.type === "package.delivered") return "entregado";
  if (payload.type === "package.returned") return "devuelto";
  if (payload.type === "package.cancelled") return "cancelado";
  const to = payload.data.to ?? payload.data.package?.status;
  return to === "en_transito" || to === "en_ruta_entrega" ? "en_camino" : "estado";
}

@Controller("webhooks/trackingapp")
class TrackingAppWebhookController {
  constructor(
    @Inject(TransactionalConnection) private connection: TransactionalConnection,
    @Inject(RequestContextService) private contexts: RequestContextService,
    @Inject(ShipmentEventsService) private events: ShipmentEventsService,
  ) {}

  @Post(":token")
  @HttpCode(200)
  async receive(
    @Param("token") token: string,
    @Headers("x-tracking-signature") signature: string | undefined,
    @Headers("x-tracking-event-id") eventIdHeader: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const channel = await this.connection.rawConnection.getRepository(Channel).findOneBy({ token });
    const secret = channel?.customFields.trackingAppWebhookSecret;
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
    if (!channel || !secret) return res.status(404).json({ error: "Tienda sin TrackingApp" });
    if (!verifyTrackingAppSignature(signature ?? "", body, secret))
      return res.status(401).json({ error: "Firma inválida" });

    const payload = JSON.parse(body.toString("utf8")) as TrackingAppPayload;
    if (payload.type === "ping" || !payload.data.package) return res.json({ ok: true });
    const ctx = await this.contexts.create({ apiType: "admin", channelOrToken: token });
    const fulfillment = await this.connection
      .getRepository(ctx, Fulfillment)
      .findOneBy({ customFields: { externalId: payload.data.package.id } } as never);
    if (!fulfillment) return res.status(404).json({ error: "Paquete desconocido" });
    const result = await this.connection.withTransaction(ctx, (tx) =>
      this.events.apply(tx, {
        provider: "trackingapp",
        eventId: eventIdHeader ?? payload.id,
        kind: kindOf(payload),
        status: TRACKINGAPP_STATUS[payload.data.package!.status] ?? payload.data.package!.status,
        fulfillmentId: fulfillment.id,
      }),
    );
    return res.json({ ok: true, result });
  }
}

const SIMULATED: Record<string, { type: string; status: string }> = {
  en_camino: { type: "package.status_changed", status: "en_ruta_entrega" },
  entregado: { type: "package.delivered", status: "entregado" },
  devuelto: { type: "package.returned", status: "devuelto" },
  cancelado: { type: "package.cancelled", status: "cancelado" },
};

@Resolver()
class ShippingAdminResolver {
  constructor(
    @Inject(TransactionalConnection) private connection: TransactionalConnection,
    @Inject(ShipmentEventsService) private events: ShipmentEventsService,
  ) {}

  /**
   * Simula lo que reporta el transportista (MVP.md: adaptador simulado). Con TrackingApp manda el webhook firmado de
   * verdad al endpoint de la tienda, así se prueba también la verificación de la firma.
   */
  @Mutation()
  @Transaction()
  @Allow(Permission.UpdateOrder)
  async simulateShipmentEvent(
    @Ctx() ctx: RequestContext,
    @Args("fulfillmentId") id: string,
    @Args("event") event: string,
  ) {
    const sim = SIMULATED[event];
    if (!sim) throw new UserInputError(`Evento desconocido: ${event}`);
    const fulfillment = await this.connection.getRepository(ctx, Fulfillment).findOneByOrFail({ id });
    if (fulfillment.customFields.provider !== "trackingapp") {
      await this.events.apply(ctx, {
        provider: fulfillment.customFields.provider ?? "propio",
        eventId: randomUUID(),
        kind: event as ShipmentEventKind,
        status: sim.status.replace(/_/g, " "),
        fulfillmentId: fulfillment.id,
      });
      return true;
    }
    const channel = ctx.channel;
    const secret = channel.customFields.trackingAppWebhookSecret;
    if (!secret) throw new UserInputError("La tienda no tiene secreto de webhook de TrackingApp");
    const body = JSON.stringify({
      id: randomUUID(),
      type: sim.type,
      createdAt: new Date().toISOString(),
      organizationId: randomUUID(),
      data: {
        package: {
          id: fulfillment.customFields.externalId,
          trackingNumber: fulfillment.trackingCode,
          status: sim.status,
        },
        to: sim.status,
      },
    });
    const base = process.env.BACKEND_PUBLIC_URL ?? "http://localhost:3000";
    const res = await fetch(`${base}/webhooks/trackingapp/${channel.token}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tracking-signature": signTrackingAppWebhook(body, secret),
        "x-tracking-event": sim.type,
        "x-tracking-event-id": randomUUID(),
        "x-tracking-attempt": "1",
      },
      body,
    });
    if (!res.ok) throw new UserInputError(`El webhook respondió ${res.status}`);
    return true;
  }
}

/** Envíos (PLAN §8, M5): envío propio por zonas, retiro, Correos, TrackingApp y los estados que reportan. */
@VendurePlugin({
  imports: [PluginCommonModule],
  entities: [ShipmentEvent],
  providers: [ShipmentEventsService],
  controllers: [TrackingAppWebhookController],
  adminApiExtensions: {
    schema: gql`
      extend type Mutation {
        "Simula un evento del transportista: en_camino, entregado, devuelto o cancelado."
        simulateShipmentEvent(fulfillmentId: ID!, event: String!): Boolean!
      }
    `,
    resolvers: [ShippingAdminResolver],
  },
  configuration: (config) => {
    config.shippingOptions.shippingCalculators.push(zoneRateCalculator, correosCalculator);
    config.shippingOptions.fulfillmentHandlers.push(correosFulfillment, trackingAppFulfillment);
    config.orderOptions.process = [...(config.orderOptions.process ?? []), shipBeforeSettling];
    // La firma se verifica sobre el cuerpo crudo: este parser va antes que el JSON de Nest (como el plugin de Stripe).
    config.apiOptions.middleware.push({
      route: "/webhooks/trackingapp",
      handler: raw({ type: "*/*", limit: "1mb" }),
      beforeListen: true,
    });
    config.dbConnectionOptions = {
      ...config.dbConnectionOptions,
      subscribers: [...((config.dbConnectionOptions.subscribers as []) ?? []), ChannelSecrets],
    };
    const tab = { tab: "Envíos" };
    config.customFields.Channel.push(
      {
        name: "trackingAppKey",
        type: "string",
        nullable: true,
        public: false,
        label: es("Llave de cliente de TrackingApp"),
        description: es("Con permisos shipments:write y packages:read. Se guarda cifrada."),
        ui: { ...tab, component: "password-form-input" },
      },
      {
        name: "trackingAppWebhookSecret",
        type: "string",
        nullable: true,
        public: false,
        label: es("Secreto del webhook de TrackingApp"),
        description: es("El whsec_… del endpoint que registró en TrackingApp. Se guarda cifrado."),
        ui: { ...tab, component: "password-form-input" },
      },
    );
    config.customFields.Fulfillment.push(
      { name: "provider", type: "string", nullable: true, readonly: true, label: es("Transportista") },
      { name: "externalId", type: "string", nullable: true, readonly: true, label: es("Id en el transportista") },
      { name: "trackingUrl", type: "string", nullable: true, readonly: true, label: es("Enlace de rastreo") },
      { name: "trackingStatus", type: "string", nullable: true, readonly: true, label: es("Estado del rastreo") },
    );
    config.customFields.ProductVariant.push({
      name: "weightGrams",
      type: "int",
      nullable: true,
      min: 0,
      label: es("Peso (gramos)"),
      description: es("Para cotizar con Correos y TrackingApp. Vacío: 500 g."),
    });
    return config;
  },
  compatibility: "^3.0.0",
})
export class ShippingPlugin {}
