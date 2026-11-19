import { Inject, Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import {
  type DeepPartial,
  EventBus,
  type ID,
  Logger,
  Order,
  OrderPlacedEvent,
  OrderStateTransitionEvent,
  type RequestContext,
  Seller,
  TransactionalConnection,
  UserInputError,
  VendureEntity,
} from "@vendure/core";
import { DEFAULT_CHANNEL_CODE } from "@vendure/common/lib/shared-constants";
import { businessDate, type CurrencyCode } from "@spora/shared";
import { Column, Entity, In, IsNull } from "typeorm";
import { agreementOn, billingMonth, commissionAmount, commissionBase, percentageBasisPoints } from "./rules";

/** Porcentaje negociado con un comercio, desde un día de negocio (PLAN §5). Renegociar = un acuerdo nuevo. */
@Entity()
export class CommissionAgreement extends VendureEntity {
  constructor(input?: DeepPartial<CommissionAgreement>) {
    super(input);
  }
  @Column("int") sellerId!: number;
  @Column("varchar") percentage!: string;
  @Column("varchar") validFrom!: string;
}

export type CommissionStatus = "pendiente" | "facturable" | "facturado" | "anulado";

/** Una línea por pedido, con copia del porcentaje vigente: renegociar no cambia pedidos pasados. */
@Entity()
export class CommissionEntry extends VendureEntity {
  constructor(input?: DeepPartial<CommissionEntry>) {
    super(input);
  }
  @Column("int", { unique: true }) orderId!: number;
  @Column("varchar") orderCode!: string;
  @Column("int") sellerId!: number;
  @Column("int") channelId!: number;
  @Column("varchar") storeName!: string;
  /** Moneda en que entró el dinero. */
  @Column("varchar") currency!: CurrencyCode;
  /** Base: subtotal de productos sin IVA ni envío. */
  @Column("int") baseAmount!: number;
  /** Movimientos anteriores al cambio (base con IVA): no se recalculan, quedan marcados. */
  @Column("boolean", { default: false }) baseIncludesTax!: boolean;
  @Column("varchar") percentage!: string;
  @Column("int") amount!: number;
  @Column("varchar", { default: "pendiente" }) status!: CommissionStatus;
  @Column({ type: Date }) placedAt!: Date;
  @Column({ type: Date, nullable: true }) billableAt!: Date | null;
  /** Mes en que se factura (`YYYY-MM`, hora de Costa Rica): el de la entrega. */
  @Column("varchar", { nullable: true }) billingMonth!: string | null;
  @Column("int", { nullable: true }) invoiceId!: number | null;
}

/** Estado de cuenta mensual de un comercio en una moneda (no es la factura electrónica de Hacienda: fuera del MVP). */
@Entity()
export class CommissionInvoice extends VendureEntity {
  constructor(input?: DeepPartial<CommissionInvoice>) {
    super(input);
  }
  @Column("int") sellerId!: number;
  @Column("varchar") month!: string;
  @Column("varchar") currency!: CurrencyCode;
  @Column("int") total!: number;
  @Column("int") entryCount!: number;
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

@Injectable()
export class CommissionService implements OnApplicationBootstrap {
  constructor(
    @Inject(TransactionalConnection) private connection: TransactionalConnection,
    @Inject(EventBus) private events: EventBus,
  ) {}

  onApplicationBootstrap() {
    const safely = (what: string, fn: () => Promise<unknown>) =>
      fn().catch((err) => Logger.error(`Comisión (${what}): ${String(err)}`, "Spora"));
    this.events.ofType(OrderPlacedEvent).subscribe((e) => safely("pedido", () => this.onPlaced(e.ctx, e.order.id)));
    this.events.ofType(OrderStateTransitionEvent).subscribe((e) => {
      if (e.toState === "Delivered") safely("entrega", () => this.onDelivered(e.ctx, e.order.id, new Date()));
      if (e.toState === "Cancelled") safely("cancelación", () => this.onCancelled(e.ctx, e.order.id));
    });
  }

  async agreements(ctx: RequestContext, sellerId: ID) {
    return this.connection
      .getRepository(ctx, CommissionAgreement)
      .find({ where: { sellerId: Number(sellerId) }, order: { validFrom: "DESC" } });
  }

  async createAgreement(ctx: RequestContext, sellerId: ID, percentage: string, validFrom: string) {
    percentageBasisPoints(percentage);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(validFrom)) throw new UserInputError("La fecha debe ser AAAA-MM-DD");
    return this.connection
      .getRepository(ctx, CommissionAgreement)
      .save(new CommissionAgreement({ sellerId: Number(sellerId), percentage: percentage.trim(), validFrom }));
  }

  /** Pedido hecho (pagado o con pago autorizado): se crea su movimiento `pendiente`. Idempotente por pedido. */
  async onPlaced(ctx: RequestContext, orderId: ID) {
    const repo = this.connection.getRepository(ctx, CommissionEntry);
    if (await repo.existsBy({ orderId: Number(orderId) })) return;
    const order = await this.connection.getRepository(ctx, Order).findOneOrFail({
      where: { id: orderId },
      relations: { channels: { seller: true }, payments: true, lines: true },
    });
    const store = order.channels.find((c) => c.code !== DEFAULT_CHANNEL_CODE);
    if (!store?.seller) return;
    const paid = order.payments.find((p) => !["Declined", "Cancelled", "Error"].includes(p.state));
    const chargedIn = ((paid?.metadata?.cobro as { currency?: CurrencyCode } | undefined)?.currency ??
      order.currencyCode) as CurrencyCode;
    const placedAt = order.orderPlacedAt ?? new Date();
    const agreement = agreementOn(await this.agreements(ctx, store.seller.id), businessDate(placedAt));
    const percentage = agreement?.percentage ?? process.env.SPORA_COMISION_POR_DEFECTO ?? "5";
    // Sin IVA: el impuesto es de Hacienda, no del comercio.
    const base = commissionBase(
      { amount: order.subTotal, currency: order.currencyCode as CurrencyCode },
      chargedIn,
      order.customFields.exchangeRate,
    );
    await repo.save(
      new CommissionEntry({
        orderId: Number(order.id),
        orderCode: order.code,
        sellerId: Number(store.seller.id),
        channelId: Number(store.id),
        storeName: store.customFields.storeName ?? store.code,
        currency: base.currency,
        baseAmount: base.amount,
        percentage,
        amount: commissionAmount(base, percentage).amount,
        placedAt,
      }),
    );
  }

  /** Entregado: la comisión se vuelve facturable en el mes de la entrega (PLAN §3.3). */
  async onDelivered(ctx: RequestContext, orderId: ID, at: Date) {
    await this.onPlaced(ctx, orderId); // por si el pedido se entregó antes de procesar el evento de "hecho"
    await this.connection
      .getRepository(ctx, CommissionEntry)
      .update(
        { orderId: Number(orderId), status: "pendiente" },
        { status: "facturable", billableAt: at, billingMonth: billingMonth(at) },
      );
  }

  /** Cancelado o devuelto: se anula, salvo que ya esté en una factura. */
  async onCancelled(ctx: RequestContext, orderId: ID) {
    await this.connection
      .getRepository(ctx, CommissionEntry)
      .update({ orderId: Number(orderId), status: In(["pendiente", "facturable"]) }, { status: "anulado" });
  }

  /**
   * Estado de cuenta del mes: lo facturable/facturado/anulado de ese mes y todo lo pendiente (aún sin entregar), con
   * totales por moneda. `sellerId` vacío = todos los comercios (admin de Spora).
   */
  async statement(ctx: RequestContext, month: string, sellerId: ID | null) {
    if (!MONTH.test(month)) throw new UserInputError("El mes debe ser AAAA-MM");
    const where = sellerId ? { sellerId: Number(sellerId) } : {};
    const entries = await this.connection.getRepository(ctx, CommissionEntry).find({
      where: [
        { ...where, billingMonth: month },
        { ...where, status: "pendiente" },
        { ...where, status: "anulado", billingMonth: IsNull() },
      ],
      order: { placedAt: "DESC" },
    });
    const visible = entries.filter((e) => e.status !== "anulado" || billingMonth(e.placedAt) === month);
    const totals = new Map<string, Record<CommissionStatus, number>>();
    for (const e of visible) {
      const t = totals.get(e.currency) ?? { pendiente: 0, facturable: 0, facturado: 0, anulado: 0 };
      t[e.status] += e.amount;
      totals.set(e.currency, t);
    }
    const seller = sellerId ? await this.connection.getRepository(ctx, Seller).findOneBy({ id: sellerId }) : null;
    return {
      month,
      sellerId,
      sellerName: seller?.name ?? null,
      totals: [...totals].map(([currency, t]) => ({ currency, ...t })),
      entries: visible,
    };
  }

  /** Cierra el mes: agrupa lo facturable por comercio y moneda en un estado de cuenta y lo marca facturado. */
  async closeMonth(ctx: RequestContext, month: string) {
    if (!MONTH.test(month)) throw new UserInputError("El mes debe ser AAAA-MM");
    const entries = await this.connection
      .getRepository(ctx, CommissionEntry)
      .find({ where: { billingMonth: month, status: "facturable", invoiceId: IsNull() } });
    const groups = new Map<string, CommissionEntry[]>();
    for (const e of entries)
      groups.set(`${e.sellerId}|${e.currency}`, [...(groups.get(`${e.sellerId}|${e.currency}`) ?? []), e]);
    const invoices: CommissionInvoice[] = [];
    for (const group of groups.values()) {
      const invoice = await this.connection.getRepository(ctx, CommissionInvoice).save(
        new CommissionInvoice({
          sellerId: group[0]!.sellerId,
          month,
          currency: group[0]!.currency,
          total: group.reduce((sum, e) => sum + e.amount, 0),
          entryCount: group.length,
        }),
      );
      await this.connection
        .getRepository(ctx, CommissionEntry)
        .update({ id: In(group.map((e) => e.id)) }, { status: "facturado", invoiceId: Number(invoice.id) });
      invoices.push(invoice);
    }
    return invoices;
  }

  invoices(ctx: RequestContext, month: string | null, sellerId: ID | null) {
    return this.connection.getRepository(ctx, CommissionInvoice).find({
      where: { ...(month ? { month } : {}), ...(sellerId ? { sellerId: Number(sellerId) } : {}) },
      order: { month: "DESC" },
    });
  }
}
