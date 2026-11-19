import { Inject, Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import { DEFAULT_CHANNEL_CODE } from "@vendure/common/lib/shared-constants";
import {
  AdministratorService,
  AssetService,
  type ID,
  Channel,
  ChannelService,
  ConfigService,
  CurrencyCode,
  defaultShippingCalculator,
  defaultShippingEligibilityChecker,
  LanguageCode,
  manualFulfillmentHandler,
  PaymentMethodService,
  Permission,
  PermissionDefinition,
  RequestContextService,
  type RequestContext,
  Role,
  RoleService,
  SellerService,
  ShippingMethodService,
  StockLocationService,
  TransactionalConnection,
  UserInputError,
  UserService,
} from "@vendure/core";
import { businessDate, type CurrencyCode as SporaCurrency } from "@spora/shared";
import { type DesignStyle, fonts, isDesignStyle } from "@spora/themes";
import { Like } from "typeorm";
import { CommissionAgreement } from "../commissions/commissions.service";
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

/** Editar el tema, los textos y las credenciales de envío de su propia tienda (updateStoreSettings), nada más del canal. */
export const updateStoreSettingsPermission = new PermissionDefinition({
  name: "UpdateStoreSettings",
  description: "Editar el tema, los textos y las credenciales de envío de la tienda",
});

/**
 * Lo que puede hacer el comercio en el Admin UI, siempre limitado a su canal. Sin UpdateChannel: con él podría cambiar
 * el comercio dueño, el código, el token, las monedas o los impuestos del canal.
 */
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
  updateStoreSettingsPermission.Permission,
];

/** Lo único del canal que el comercio puede cambiar. `undefined` = no se toca; `null` = se borra. */
export interface StoreSettingsInput {
  storeName?: string | null;
  designStyle?: string | null;
  primaryColor?: string | null;
  font?: string | null;
  logoId?: ID | null;
  tagline?: string | null;
  about?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  shippingPolicy?: string | null;
  returnsPolicy?: string | null;
  privacyPolicy?: string | null;
  trackingAppKey?: string | null;
  trackingAppWebhookSecret?: string | null;
}

export interface CreateStoreInput {
  /** Nombre del negocio (comercio) y de la tienda. */
  name: string;
  /** Subdominio: `<slug>.spora.cr`. También es el código y el token del canal. */
  slug: string;
  baseCurrency: SporaCurrency;
  designStyle?: DesignStyle;
  status?: SellerStatus;
  /** Comisión negociada (p. ej. "7.5"); sin valor, la de SPORA_COMISION_POR_DEFECTO. Rige desde hoy. */
  commissionPercentage?: string;
  administrator: { firstName: string; lastName: string; emailAddress: string; password: string };
}

@Injectable()
export class StoreService implements OnApplicationBootstrap {
  constructor(
    @Inject(TransactionalConnection) private connection: TransactionalConnection,
    @Inject(SellerService) private sellers: SellerService,
    @Inject(ChannelService) private channels: ChannelService,
    @Inject(StockLocationService) private stockLocations: StockLocationService,
    @Inject(RoleService) private roles: RoleService,
    @Inject(AdministratorService) private administrators: AdministratorService,
    @Inject(ShippingMethodService) private shippingMethods: ShippingMethodService,
    @Inject(PaymentMethodService) private paymentMethods: PaymentMethodService,
    @Inject(AssetService) private assets: AssetService,
    @Inject(ConfigService) private config: ConfigService,
    @Inject(UserService) private users: UserService,
    @Inject(RequestContextService) private contexts: RequestContextService,
  ) {}

  /** Los roles de comercio ya creados quedan con los permisos de hoy (p. ej. sin UpdateChannel). */
  async onApplicationBootstrap() {
    const roles = this.connection.rawConnection.getRepository(Role);
    for (const role of await roles.findBy({ code: Like("tienda-%") })) {
      if (role.permissions.join() !== SELLER_PERMISSIONS.join()) {
        await roles.update({ id: role.id }, { permissions: SELLER_PERMISSIONS });
      }
    }
  }

  /**
   * Tema, textos y credenciales de envío de la tienda activa (la del vendure-token). El permiso se revisa en ese canal,
   * así que un comercio no llega a otra tienda. Las credenciales se cifran al guardar (ChannelSecrets).
   */
  async updateSettings(ctx: RequestContext, input: StoreSettingsInput): Promise<Channel> {
    if (ctx.channel.code === DEFAULT_CHANNEL_CODE) throw new UserInputError("Indique la tienda con vendure-token");
    const { logoId, ...fields } = input;
    for (const [name, value] of Object.entries(fields)) {
      if (typeof value === "string" && value.length > 5000) throw new UserInputError(`${name}: demasiado largo`);
    }
    if (fields.designStyle != null && !isDesignStyle(fields.designStyle)) {
      throw new UserInputError(`Estilo desconocido: ${fields.designStyle}`);
    }
    if (fields.font != null && !(fields.font in fonts)) {
      throw new UserInputError(`Tipografía desconocida: ${fields.font}`);
    }
    if (fields.primaryColor === "") fields.primaryColor = null;
    if (fields.primaryColor != null && !/^#[0-9a-fA-F]{6}$/.test(fields.primaryColor)) {
      throw new UserInputError("primaryColor: use un color hexadecimal como #1d6b4f");
    }
    if (logoId != null && !(await this.assets.findOne(ctx, logoId))) {
      throw new UserInputError("Logo: imagen no encontrada en la tienda");
    }
    // ChannelService.update exige UpdateChannel, que el comercio no tiene: ya validado el permiso propio y los campos,
    // se guarda como admin de Spora en el mismo canal.
    const superadmin = await this.users.getUserByEmailAddress(
      ctx,
      this.config.authOptions.superadminCredentials.identifier,
    );
    const asSpora = await this.contexts.create({ apiType: "admin", user: superadmin, channelOrToken: ctx.channel });
    const updated = await this.channels.update(asSpora, {
      id: ctx.channelId,
      customFields: { ...fields, ...(logoId !== undefined ? { logoId } : {}) },
    });
    if (!("id" in updated)) throw new UserInputError(updated.message);
    return updated;
  }

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
    await this.connection.getRepository(ctx, CommissionAgreement).save(
      new CommissionAgreement({
        sellerId: Number(seller.id),
        percentage: input.commissionPercentage ?? process.env.SPORA_COMISION_POR_DEFECTO ?? "5",
        validFrom: businessDate(),
      }),
    );
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
