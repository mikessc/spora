import { type CallHandler, type ExecutionContext, Inject, Injectable, type NestInterceptor } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { Query, Resolver } from "@nestjs/graphql";
import { DEFAULT_CHANNEL_CODE } from "@vendure/common/lib/shared-constants";
import {
  Allow,
  ChannelService,
  Ctx,
  Customer,
  idsAreEqual,
  internal_getRequestContext,
  LanguageCode,
  Order,
  parseContext,
  Permission,
  PluginCommonModule,
  type RequestContext,
  TransactionalConnection,
  VendurePlugin,
} from "@vendure/core";
import gql from "graphql-tag";
import { IsNull, Not } from "typeorm";

declare module "@vendure/core/dist/entity/custom-entity-fields" {
  interface CustomAddressFields {
    district: string | null;
    districtCode: string | null;
  }
}

const es = (value: string) => [{ languageCode: LanguageCode.es, value }];

/**
 * Cuenta Spora: una sola cuenta para todas las tiendas. Vendure solo reconoce a un cliente en los canales a los que
 * está asignado; con la sesión compartida entre subdominios, se asigna al canal de cada tienda donde opere.
 */
@Injectable()
export class CustomerChannelInterceptor implements NestInterceptor {
  private assigned = new Set<string>();

  constructor(
    @Inject(TransactionalConnection) private connection: TransactionalConnection,
    @Inject(ChannelService) private channels: ChannelService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler) {
    const { req } = parseContext(context);
    const ctx = req ? internal_getRequestContext(req, context) : undefined;
    if (ctx?.apiType === "shop" && ctx.activeUserId && ctx.channel.code !== DEFAULT_CHANNEL_CODE) {
      const key = `${ctx.activeUserId}:${ctx.channelId}`;
      if (!this.assigned.has(key)) {
        const customer = await this.connection.rawConnection
          .getRepository(Customer)
          .createQueryBuilder("customer")
          .leftJoin("customer.user", "user")
          .leftJoinAndSelect("customer.channels", "channel")
          .where("user.id = :userId", { userId: ctx.activeUserId })
          .getOne();
        if (customer && !customer.channels.some((ch) => idsAreEqual(ch.id, ctx.channelId))) {
          await this.channels.assignToChannels(ctx, Customer, customer.id, [ctx.channelId]);
        }
        // ponytail: en memoria y por proceso; con varios procesos cada uno revisa una vez por cliente y tienda.
        this.assigned.add(key);
      }
    }
    return next.handle();
  }
}

@Resolver()
class AccountShopResolver {
  constructor(@Inject(TransactionalConnection) private connection: TransactionalConnection) {}

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
      };
    });
  }
}

@VendurePlugin({
  imports: [PluginCommonModule],
  providers: [{ provide: APP_INTERCEPTOR, useClass: CustomerChannelInterceptor }],
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
      }
      type SporaShipment {
        method: String!
        trackingCode: String!
        trackingUrl: String
        status: String
      }
      extend type Query {
        sporaOrders: [SporaOrder!]!
      }
    `,
    resolvers: [AccountShopResolver],
  },
  configuration: (config) => {
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
