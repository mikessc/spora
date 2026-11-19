import { readFileSync } from "node:fs";
import { Controller, Get, Header, Inject } from "@nestjs/common";
import { Args, Mutation, Query, Resolver } from "@nestjs/graphql";
import {
  Allow,
  Ctx,
  ForbiddenError,
  type ID,
  Permission,
  PluginCommonModule,
  type RequestContext,
  Transaction,
  VendurePlugin,
} from "@vendure/core";
import gql from "graphql-tag";
import { CommissionAgreement, CommissionEntry, CommissionInvoice, CommissionService } from "./commissions.service";

const isSporaAdmin = (ctx: RequestContext) => ctx.userHasPermissions([Permission.SuperAdmin]);

/** El admin de Spora ve cualquier comercio (o todos); un comercio solo el suyo (el de la tienda del vendure-token). */
function sellerScope(ctx: RequestContext, requested: ID | null | undefined): ID | null {
  if (isSporaAdmin(ctx)) return requested ?? null;
  const own = ctx.channel.sellerId;
  if (!own || (requested && String(requested) !== String(own))) throw new ForbiddenError();
  return own;
}

@Resolver()
class CommissionAdminResolver {
  constructor(@Inject(CommissionService) private commissions: CommissionService) {}

  @Query()
  @Allow(Permission.ReadOrder)
  commissionStatement(@Ctx() ctx: RequestContext, @Args("month") month: string, @Args("sellerId") sellerId?: ID) {
    return this.commissions.statement(ctx, month, sellerScope(ctx, sellerId));
  }

  @Query()
  @Allow(Permission.ReadOrder)
  commissionAgreements(@Ctx() ctx: RequestContext, @Args("sellerId") sellerId?: ID) {
    const seller = sellerScope(ctx, sellerId);
    if (!seller) throw new ForbiddenError();
    return this.commissions.agreements(ctx, seller);
  }

  @Query()
  @Allow(Permission.ReadOrder)
  commissionInvoices(@Ctx() ctx: RequestContext, @Args("month") month?: string, @Args("sellerId") sellerId?: ID) {
    return this.commissions.invoices(ctx, month ?? null, sellerScope(ctx, sellerId));
  }

  @Mutation()
  @Transaction()
  @Allow(Permission.SuperAdmin)
  createCommissionAgreement(
    @Ctx() ctx: RequestContext,
    @Args("sellerId") sellerId: ID,
    @Args("percentage") percentage: string,
    @Args("validFrom") validFrom: string,
  ) {
    return this.commissions.createAgreement(ctx, sellerId, percentage, validFrom);
  }

  @Mutation()
  @Transaction()
  @Allow(Permission.SuperAdmin)
  closeCommissionMonth(@Ctx() ctx: RequestContext, @Args("month") month: string) {
    return this.commissions.closeMonth(ctx, month);
  }
}

/**
 * Panel de comisiones (comercio y admin de Spora). Página estática en el mismo origen que el Admin UI: usa su sesión
 * y consulta la Admin API desde el navegador.
 */
@Controller("panel")
class CommissionPanelController {
  private html = readFileSync(new URL("./panel.html", import.meta.url), "utf8");

  @Get("comisiones")
  @Header("content-type", "text/html; charset=utf-8")
  @Header("cache-control", "no-store")
  page() {
    return this.html;
  }
}

/** Comisiones (PLAN §5, M6): acuerdos con vigencias, un movimiento por pedido y estado de cuenta mensual. */
@VendurePlugin({
  imports: [PluginCommonModule],
  entities: [CommissionAgreement, CommissionEntry, CommissionInvoice],
  providers: [CommissionService],
  exports: [CommissionService],
  controllers: [CommissionPanelController],
  adminApiExtensions: {
    schema: gql`
      type CommissionAgreement {
        id: ID!
        sellerId: ID!
        percentage: String!
        validFrom: String!
      }
      type CommissionEntry {
        id: ID!
        orderCode: String!
        storeName: String!
        status: String!
        currency: String!
        "Subtotal de productos sin IVA ni envío."
        baseAmount: Money!
        "true en movimientos anteriores al cambio a base sin IVA (no se recalculan)."
        baseIncludesTax: Boolean!
        percentage: String!
        amount: Money!
        placedAt: DateTime!
        billableAt: DateTime
        billingMonth: String
      }
      type CommissionTotal {
        currency: String!
        pendiente: Money!
        facturable: Money!
        facturado: Money!
        anulado: Money!
      }
      type CommissionStatement {
        month: String!
        sellerId: ID
        sellerName: String
        totals: [CommissionTotal!]!
        entries: [CommissionEntry!]!
      }
      type CommissionInvoice {
        id: ID!
        sellerId: ID!
        month: String!
        currency: String!
        total: Money!
        entryCount: Int!
      }
      extend type Query {
        "Estado de cuenta del mes (AAAA-MM). Un comercio ve solo el suyo; el admin de Spora, cualquiera o todos."
        commissionStatement(month: String!, sellerId: ID): CommissionStatement!
        commissionAgreements(sellerId: ID): [CommissionAgreement!]!
        commissionInvoices(month: String, sellerId: ID): [CommissionInvoice!]!
      }
      extend type Mutation {
        createCommissionAgreement(sellerId: ID!, percentage: String!, validFrom: String!): CommissionAgreement!
        "Cierra el mes: agrupa lo facturable por comercio y moneda y lo marca facturado."
        closeCommissionMonth(month: String!): [CommissionInvoice!]!
      }
    `,
    resolvers: [CommissionAdminResolver],
  },
  compatibility: "^3.0.0",
})
export class CommissionsPlugin {}
