import { Inject, Injectable } from "@nestjs/common";
import { DEFAULT_CHANNEL_CODE } from "@vendure/common/lib/shared-constants";
import {
  AdministratorService,
  type ID,
  Channel,
  ChannelService,
  CurrencyCode,
  defaultShippingCalculator,
  defaultShippingEligibilityChecker,
  LanguageCode,
  manualFulfillmentHandler,
  PaymentMethodService,
  Permission,
  type RequestContext,
  RoleService,
  SellerService,
  ShippingMethodService,
  StockLocationService,
  TransactionalConnection,
  UserInputError,
} from "@vendure/core";
import { type CurrencyCode as SporaCurrency } from "@spora/shared";
import { type DesignStyle } from "@spora/themes";
import { cashOnDeliveryHandler } from "../payments/handlers";
import { zoneRateArgs, zoneRateCalculator } from "../shipping/providers";

/** Tarifa fija (calculadora por defecto de Vendure), con impuestos incluidos. */
export const flatRate = (rate: number) => ({
  code: defaultShippingCalculator.code,
  arguments: [
    { name: "rate", value: String(rate) },
    { name: "includesTax", value: "include" },
    { name: "taxRate", value: "0" },
  ],
});

export type SellerStatus = "pendiente" | "activo" | "suspendido";
export const sellerStatuses: SellerStatus[] = ["pendiente", "activo", "suspendido"];

/** Subdominios que no pueden ser tiendas. */
const RESERVED = new Set(["www", "admin", "api", "spora", "marketplace", "cuenta", "assets", "static", "mail"]);
const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

/** Lo que puede hacer el comercio en el Admin UI, siempre limitado a su canal. */
export const SELLER_PERMISSIONS: Permission[] = [
  Permission.Authenticated,
  Permission.CreateCatalog,
  Permission.ReadCatalog,
  Permission.UpdateCatalog,
  Permission.DeleteCatalog,
  Permission.ReadOrder,
  Permission.UpdateOrder,
  Permission.ReadCustomer,
  Permission.ReadPaymentMethod,
  Permission.CreatePaymentMethod,
  Permission.UpdatePaymentMethod,
  Permission.DeletePaymentMethod,
  Permission.ReadShippingMethod,
  Permission.CreateShippingMethod,
  Permission.UpdateShippingMethod,
  Permission.DeleteShippingMethod,
  Permission.ReadStockLocation,
  Permission.ReadSettings,
  Permission.ReadChannel,
  Permission.UpdateChannel,
];

export interface CreateStoreInput {
  /** Nombre del negocio (comercio) y de la tienda. */
  name: string;
  /** Subdominio: `<slug>.spora.cr`. También es el código y el token del canal. */
  slug: string;
  baseCurrency: SporaCurrency;
  designStyle?: DesignStyle;
  status?: SellerStatus;
  administrator: { firstName: string; lastName: string; emailAddress: string; password: string };
}

@Injectable()
export class StoreService {
  constructor(
    @Inject(TransactionalConnection) private connection: TransactionalConnection,
    @Inject(SellerService) private sellers: SellerService,
    @Inject(ChannelService) private channels: ChannelService,
    @Inject(StockLocationService) private stockLocations: StockLocationService,
    @Inject(RoleService) private roles: RoleService,
    @Inject(AdministratorService) private administrators: AdministratorService,
    @Inject(ShippingMethodService) private shippingMethods: ShippingMethodService,
    @Inject(PaymentMethodService) private paymentMethods: PaymentMethodService,
  ) {}

  /**
   * Alta de comercio: crea el comercio, su canal (la tienda) con su propia ubicación de stock, el rol limitado a ese
   * canal y el usuario administrador. Debe correr dentro de una transacción con un ctx de superadmin.
   */
  async createStore(ctx: RequestContext, input: CreateStoreInput): Promise<Channel> {
    const slug = input.slug.trim().toLowerCase();
    if (!SLUG.test(slug) || RESERVED.has(slug)) {
      throw new UserInputError(`"${input.slug}" no sirve como subdominio: use de 3 a 40 letras, números o guiones`);
    }
    const defaultChannel = await this.channels.getDefaultChannel(ctx);
    const seller = await this.sellers.create(ctx, {
      name: input.name,
      customFields: { status: input.status ?? "pendiente" },
    });
    const created = await this.channels.create(ctx, {
      code: slug,
      token: slug,
      sellerId: seller.id,
      defaultLanguageCode: LanguageCode.es,
      availableLanguageCodes: [LanguageCode.es],
      defaultCurrencyCode: CurrencyCode[input.baseCurrency],
      availableCurrencyCodes: [CurrencyCode[input.baseCurrency]],
      pricesIncludeTax: true,
      defaultTaxZoneId: defaultChannel.defaultTaxZone.id,
      defaultShippingZoneId: defaultChannel.defaultShippingZone.id,
      customFields: { storeName: input.name, designStyle: input.designStyle ?? "suave" },
    });
    if (!("id" in created)) throw new UserInputError(created.message);

    // Sin ubicación de stock propia, todo el catálogo de la tienda sale "agotado".
    const location = await this.stockLocations.create(ctx, { name: `Bodega · ${input.name}` });
    await this.stockLocations.assignStockLocationsToChannel(ctx, {
      stockLocationIds: [location.id],
      channelId: created.id,
    });

    const role = await this.roles.create(ctx, {
      code: `tienda-${slug}`,
      description: `Administración de ${input.name}`,
      channelIds: [created.id],
      permissions: SELLER_PERMISSIONS,
    });
    await this.administrators.create(ctx, { ...input.administrator, roleIds: [role.id] });
    await this.createDefaultMethods(ctx, created.id, slug, input.baseCurrency);
    return created;
  }

  /**
   * Toda tienda nueva puede vender desde el primer día: envío propio (misma tarifa en todas las provincias, que el
   * comercio ajusta por zona), retiro en local y contra entrega. (Vendure los deja también en el canal por defecto.)
   */
  private async createDefaultMethods(ctx: RequestContext, channelId: ID, slug: string, currency: SporaCurrency) {
    await this.addShippingMethod(ctx, channelId, slug, {
      code: "envio",
      name: "Envío a domicilio",
      description: "Entrega en 2 a 4 días hábiles.",
      calculator: { code: zoneRateCalculator.code, arguments: zoneRateArgs(currency === "CRC" ? 250000 : 500) },
    });
    await this.addShippingMethod(ctx, channelId, slug, {
      code: "retiro",
      name: "Retiro en local",
      description: "Coordine el retiro con la tienda.",
      calculator: flatRate(0),
    });
    await this.addPaymentMethod(ctx, channelId, slug, {
      handler: cashOnDeliveryHandler.code,
      name: "Contra entrega",
      description: "Pague en efectivo o SINPE al recibir.",
    });
  }

  /**
   * Activa un proveedor de envío en una tienda (código `<tienda>-<código>`): cómo cotiza (calculator) y quién crea la
   * guía (fulfillment handler; por defecto, manual: la tienda entrega y marca el estado).
   */
  async addShippingMethod(
    ctx: RequestContext,
    channelId: ID,
    slug: string,
    method: {
      code: string;
      name: string;
      description: string;
      calculator: { code: string; arguments: { name: string; value: string }[] };
      fulfillmentHandler?: string;
    },
  ) {
    const created = await this.shippingMethods.create(ctx, {
      code: `${slug}-${method.code}`,
      fulfillmentHandler: method.fulfillmentHandler ?? manualFulfillmentHandler.code,
      checker: { code: defaultShippingEligibilityChecker.code, arguments: [{ name: "orderMinimum", value: "0" }] },
      calculator: method.calculator,
      translations: [{ languageCode: LanguageCode.es, name: method.name, description: method.description }],
    });
    await this.shippingMethods.assignShippingMethodsToChannel(ctx, { shippingMethodIds: [created.id], channelId });
    return created;
  }

  /**
   * Activa un proveedor de pago en una tienda (código `<tienda>-<proveedor>`). Las credenciales van en `args` y se
   * guardan cifradas (PaymentMethodSecrets).
   */
  async addPaymentMethod(
    ctx: RequestContext,
    channelId: ID,
    slug: string,
    method: { handler: string; name: string; description: string; args?: Record<string, string> },
  ) {
    const created = await this.paymentMethods.create(ctx, {
      code: `${slug}-${method.handler}`,
      enabled: true,
      handler: {
        code: method.handler,
        arguments: Object.entries(method.args ?? {}).map(([name, value]) => ({ name, value })),
      },
      translations: [{ languageCode: LanguageCode.es, name: method.name, description: method.description }],
    });
    await this.paymentMethods.assignPaymentMethodsToChannel(ctx, { paymentMethodIds: [created.id], channelId });
    return created;
  }

  /** Estado del comercio dueño del canal con este token; `null` para el canal del marketplace o un token desconocido. */
  async statusForToken(token: string): Promise<SellerStatus | null> {
    const channel = await this.connection.rawConnection
      .getRepository(Channel)
      .findOne({ where: { token }, relations: { seller: true } });
    if (!channel?.seller || channel.code === DEFAULT_CHANNEL_CODE) return null;
    return channel.seller.customFields.status ?? "pendiente";
  }
}
