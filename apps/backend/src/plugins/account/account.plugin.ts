import { Inject, Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import { Args, Mutation, Query, Resolver } from "@nestjs/graphql";
import { DEFAULT_CHANNEL_CODE } from "@vendure/common/lib/shared-constants";
import {
  Address,
  Allow,
  ChannelService,
  CountryService,
  Ctx,
  Customer,
  CustomerEvent,
  CustomerService,
  DefaultActiveOrderStrategy,
  EventBus,
  ForbiddenError,
  type Injector,
  LanguageCode,
  Logger,
  Order,
  type OrderProcess,
  OrderService,
  Permission,
  PluginCommonModule,
  type RequestContext,
  Transaction,
  TransactionalConnection,
  VendurePlugin,
} from "@vendure/core";
import { canConfirmDelivery } from "@spora/shared";
import gql from "graphql-tag";
import { IsNull, Not } from "typeorm";
import { isPickup } from "../shipping/shipping.plugin";

declare module "@vendure/core/dist/entity/custom-entity-fields" {
  interface CustomAddressFields {
    district: string | null;
    districtCode: string | null;
  }
}

const es = (value: string) => [{ languageCode: LanguageCode.es, value }];

/**
 * Cuenta Spora: una sola cuenta para todas las tiendas, pero una tienda solo ve a quien le compró. El cliente queda
 * asignado al canal de una tienda (y el comercio ve sus datos) recién cuando hace su primer pedido ahí. Antes, su
 * carrito, su saludo y sus direcciones se leen sin filtrar por canal (Vendure sí filtra).
 */
@Injectable()
export class StoreCustomerService implements OnApplicationBootstrap {
  constructor(
    @Inject(EventBus) private events: EventBus,
    @Inject(ChannelService) private channels: ChannelService,
    @Inject(TransactionalConnection) private connection: TransactionalConnection,
  ) {}

  onApplicationBootstrap() {
    const safely = (what: string, fn: () => Promise<unknown>) =>
      fn().catch((err) => Logger.error(`Cliente de la tienda (${what}): ${String(err)}`, "Spora"));
    // Registrarse (o dar sus datos como invitado) en una tienda no la hace dueña de la cuenta: la cuenta es de Spora.
    // Vendure asigna al cliente nuevo al canal donde se creó; si no llega a comprar, la tienda no lo ve.
    this.events.ofType(CustomerEvent).subscribe((e) =>
      safely("alta", async () => {
        if (e.type !== "created" || e.ctx.apiType !== "shop" || e.ctx.channel.code === DEFAULT_CHANNEL_CODE) return;
        // Si ya compró (un invitado que paga enseguida), queda: es cliente de la tienda.
        const bought = await this.connection
          .getRepository(e.ctx, Order)
          .createQueryBuilder("order")
          .innerJoin("order.channels", "channel", "channel.id = :channelId", { channelId: e.ctx.channelId })
          .where("order.customerId = :customerId", { customerId: e.entity.id })
          .andWhere("order.orderPlacedAt IS NOT NULL")
          .getCount();
        if (!bought) await this.channels.removeFromChannels(e.ctx, Customer, e.entity.id, [e.ctx.channelId]);
      }),
    );
  }
}

/**
 * Al hacer el pedido (ArrangingPayment → pago autorizado o pagado), el cliente pasa a ser de la tienda. Va en la misma
 * transición y no en OrderPlacedEvent porque Vendure, al hacer el pedido, guarda las direcciones del cliente nuevo y
 * para eso ya tiene que estar en el canal.
 */
export const assignCustomerOnPlacement: OrderProcess<never> = {
  init(injector) {
    channelService = injector.get(ChannelService);
  },
  async onTransitionStart(fromState, toState, { ctx, order }) {
    const placing =
      fromState === "ArrangingPayment" && (toState === "PaymentAuthorized" || toState === "PaymentSettled");
    const customerId = order.customerId ?? order.customer?.id;
    if (placing && customerId) await channelService.assignToChannels(ctx, Customer, customerId, [ctx.channelId]);
  },
};
let channelService: ChannelService;

/**
 * Carrito de la Cuenta Spora en una tienda que todavía no la conoce: la de la sesión o la última activa del usuario en
 * ese canal, siempre con el cliente puesto (Vendure solo lo pone si el cliente ya está asignado al canal).
 */
export class SporaActiveOrderStrategy extends DefaultActiveOrderStrategy {
  private db!: TransactionalConnection;
  private customerService!: CustomerService;
  private orderLookup!: OrderService;

  override async init(injector: Injector) {
    await super.init(injector);
    this.db = injector.get(TransactionalConnection);
    this.customerService = injector.get(CustomerService);
    this.orderLookup = injector.get(OrderService);
  }

  override async determineActiveOrder(ctx: RequestContext) {
    let order = await super.determineActiveOrder(ctx);
    if (!order && ctx.activeUserId) {
      const found = await this.db
        .getRepository(ctx, Order)
        .createQueryBuilder("order")
        .innerJoin("order.channels", "channel", "channel.id = :channelId", { channelId: ctx.channelId })
        .innerJoin("order.customer", "customer")
        .innerJoin("customer.user", "user")
        .where("order.active = :active", { active: true })
        .andWhere("user.id = :userId", { userId: ctx.activeUserId })
        .orderBy("order.createdAt", "DESC")
        .getOne();
      order = found ? await this.orderLookup.findOne(ctx, found.id) : undefined;
    }
    return order && this.withCustomer(ctx, order);
  }

  override async createActiveOrder(ctx: RequestContext) {
    return this.withCustomer(ctx, await super.createActiveOrder(ctx));
  }

  private async withCustomer(ctx: RequestContext, order: Order) {
    if (!ctx.activeUserId || order.customerId) return order;
    const customer = await this.customerService.findOneByUserId(ctx, ctx.activeUserId, false);
    if (!customer) return order;
    await this.db.getRepository(ctx, Order).update({ id: order.id }, { customer: { id: customer.id } });
    order.customer = customer;
    order.customerId = customer.id;
    return order;
  }
}

@Resolver()
class AccountShopResolver {
  constructor(
    @Inject(TransactionalConnection) private connection: TransactionalConnection,
    @Inject(CustomerService) private customers: CustomerService,
    @Inject(CountryService) private countries: CountryService,
  ) {}

  /** El cliente de la sesión en cualquier tienda (`activeCustomer` solo lo ve en los canales donde ya compró). */
  @Query()
  @Allow(Permission.Owner)
  async sporaCustomer(@Ctx() ctx: RequestContext) {
    return ctx.activeUserId ? ((await this.customers.findOneByUserId(ctx, ctx.activeUserId, false)) ?? null) : null;
  }

  /** Guarda una dirección en la Cuenta Spora desde cualquier tienda (`createCustomerAddress` exige el canal). */
  @Mutation()
  @Transaction()
  @Allow(Permission.Owner)
  async sporaCreateAddress(@Ctx() ctx: RequestContext, @Args("input") input: Record<string, unknown>) {
    const customer = ctx.activeUserId ? await this.customers.findOneByUserId(ctx, ctx.activeUserId, false) : null;
    if (!customer) throw new ForbiddenError();
    const country = await this.countries.findOneByCode(ctx, String(input.countryCode));
    return this.connection.getRepository(ctx, Address).save(new Address({ ...input, country, customer }));
  }

  /** Historial de pedidos del cliente en todas las tiendas (la query `activeCustomer.orders` solo ve un canal). */
  @Query()
  @Allow(Permission.Owner)
  async sporaOrders(@Ctx() ctx: RequestContext) {
    if (!ctx.activeUserId) return [];
    const orders = await this.connection
      .getRepository(ctx, Order)
      .createQueryBuilder("order")
      .innerJoin("order.customer", "customer")
      .innerJoin("customer.user", "user")
      .leftJoinAndSelect("order.channels", "channel")
      .leftJoinAndSelect("order.fulfillments", "fulfillment")
      .leftJoinAndSelect("order.shippingLines", "shippingLine")
      .leftJoinAndSelect("shippingLine.shippingMethod", "shippingMethod")
      .where("user.id = :userId", { userId: ctx.activeUserId })
      .andWhere({ orderPlacedAt: Not(IsNull()) })
      .orderBy("order.orderPlacedAt", "DESC")
      .take(100)
      .getMany();
    return orders.map((order) => {
      const store = order.channels.find((ch) => ch.code !== DEFAULT_CHANNEL_CODE);
      return {
        code: order.code,
        state: order.state,
        orderPlacedAt: order.orderPlacedAt,
        total: order.totalWithTax,
        currencyCode: order.currencyCode,
        exchangeRate: order.customFields.exchangeRate,
        storeToken: store?.token ?? "",
        storeName: store?.customFields.storeName ?? store?.code ?? "",
        shipment: (() => {
          const f = order.fulfillments.find((x) => x.state !== "Cancelled") ?? order.fulfillments[0];
          return f
            ? {
                method: f.method,
                trackingCode: f.trackingCode,
                trackingUrl: f.customFields.trackingUrl,
                status: f.customFields.trackingStatus,
              }
            : null;
        })(),
        canConfirmDelivery: canConfirmDelivery({
          state: order.state,
          pickup: isPickup(order),
          report: order.customFields.customerDeliveryReport,
        }),
        deliveryReport: order.customFields.customerDeliveryReport,
      };
    });
  }
}

@VendurePlugin({
  imports: [PluginCommonModule],
  providers: [StoreCustomerService],
  shopApiExtensions: {
    schema: gql`
      type SporaOrder {
        code: String!
        state: String!
        orderPlacedAt: DateTime
        total: Money!
        currencyCode: CurrencyCode!
        exchangeRate: String
        storeToken: String!
        storeName: String!
        shipment: SporaShipment
        "Mostrar ¿Recibiste tu pedido? (reportOrderDelivery)."
        canConfirmDelivery: Boolean!
        "recibido o no-recibido (en disputa), si el cliente ya respondió."
        deliveryReport: String
      }
      type SporaShipment {
        method: String!
        trackingCode: String!
        trackingUrl: String
        status: String
      }
      extend type Query {
        sporaOrders: [SporaOrder!]!
        "El cliente de la sesión, en cualquier tienda (aunque todavía no le haya comprado)."
        sporaCustomer: Customer
      }
      extend type Mutation {
        "Guarda una dirección en la Cuenta Spora desde cualquier tienda."
        sporaCreateAddress(input: CreateAddressInput!): Address!
      }
    `,
    resolvers: [AccountShopResolver],
  },
  configuration: (config) => {
    // Vendure (≥ 3.7) asigna al cliente a cada canal que visita con la sesión iniciada: aquí, solo al comprar.
    config.authOptions.customerChannelAssignmentStrategy = { canAssignCustomerToChannel: () => false };
    config.orderOptions.activeOrderStrategy = new SporaActiveOrderStrategy();
    config.orderOptions.process = [...(config.orderOptions.process ?? []), assignCustomerOnPlacement];
    // Direcciones con el nomenclátor de CR (compartido con TrackingApp): provincia → `province`, cantón → `city`,
    // distrito → estos campos, código postal → `postalCode`.
    config.customFields.Address.push(
      { name: "district", type: "string", nullable: true, label: es("Distrito") },
      { name: "districtCode", type: "string", nullable: true, label: es("Código de distrito (nomenclátor)") },
    );
    return config;
  },
  compatibility: "^3.0.0",
})
export class AccountPlugin {}
