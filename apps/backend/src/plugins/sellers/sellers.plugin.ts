import { Inject, Injectable, type MiddlewareConsumer, type NestMiddleware, type NestModule } from "@nestjs/common";
import { Args, Mutation, Query, Resolver } from "@nestjs/graphql";
import {
  Allow,
  Asset,
  ConfigService,
  Ctx,
  LanguageCode,
  Permission,
  PluginCommonModule,
  type RequestContext,
  Transaction,
  VendurePlugin,
} from "@vendure/core";
import { designStyles, fonts, paletteLabels, paletteRoles } from "@spora/themes";
import type { NextFunction, Request, Response } from "express";
import { DEFAULT_CHANNEL_CODE } from "@vendure/common/lib/shared-constants";
import gql from "graphql-tag";
import {
  type CreateStoreInput,
  type SellerStatus,
  sellerStatuses,
  paletteField,
  type StoreSettingsInput,
  StoreService,
  updateStoreSettingsPermission,
} from "./store.service";

declare module "@vendure/core/dist/entity/custom-entity-fields" {
  interface CustomSellerFields {
    status: SellerStatus;
  }
  interface CustomChannelFields {
    storeName: string | null;
    designStyle: string;
    palettePrimary: string | null;
    paletteSecondary: string | null;
    paletteAccent: string | null;
    paletteBackground: string | null;
    paletteText: string | null;
    font: string;
    logo: Asset | null;
    tagline: string | null;
    about: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    shippingPolicy: string | null;
    returnsPolicy: string | null;
    privacyPolicy: string | null;
  }
}

const es = (value: string) => [{ languageCode: LanguageCode.es, value }];

/** Solo un comercio `activo` publica: la Shop API de una tienda pendiente o suspendida responde 403. */
@Injectable()
export class ActiveStoreMiddleware implements NestMiddleware {
  constructor(@Inject(StoreService) private stores: StoreService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const token = req.get("vendure-token");
    // ponytail: una consulta por request; cachear por token si pesa.
    const status = token ? await this.stores.statusForToken(token) : null;
    if (status && status !== "activo") {
      res.status(403).json({ errors: [{ message: "Tienda no disponible", extensions: { code: "STORE_NOT_ACTIVE" } }] });
      return;
    }
    next();
  }
}

const adminApi = gql`
  enum StoreCurrency {
    CRC
    USD
  }
  input StoreAdministratorInput {
    firstName: String!
    lastName: String!
    emailAddress: String!
    password: String!
  }
  input RegisterStoreInput {
    name: String!
    slug: String!
    baseCurrency: StoreCurrency!
    designStyle: String
    "Comisión negociada, p. ej. 7.5 (por defecto, la de SPORA_COMISION_POR_DEFECTO)."
    commissionPercentage: String
    administrator: StoreAdministratorInput!
  }
  "Lo que el comercio puede cambiar de su tienda. Un campo que no se manda no se toca; null lo borra."
  input StoreSettingsInput {
    storeName: String
    designStyle: String
    "Paleta de 5 colores (hexadecimal). Sin paleta completa, la tienda usa la de Spora."
    palettePrimary: String
    paletteSecondary: String
    paletteAccent: String
    paletteBackground: String
    paletteText: String
    font: String
    logoId: ID
    tagline: String
    about: String
    contactEmail: String
    contactPhone: String
    shippingPolicy: String
    returnsPolicy: String
    privacyPolicy: String
    trackingAppKey: String
    trackingAppWebhookSecret: String
  }
  extend type Query {
    "URL pública de la tienda activa (para la vista previa de Mi tienda). null en el canal del marketplace."
    storeUrl: String
  }
  extend type Mutation {
    "Alta de comercio: crea comercio (pendiente), canal, ubicación de stock, rol limitado y usuario administrador."
    registerStore(input: RegisterStoreInput!): Channel!
    "Tema, textos y credenciales de envío de la tienda activa (vendure-token). Solo eso: el resto del canal es de Spora."
    updateStoreSettings(input: StoreSettingsInput!): Channel!
  }
`;

@Resolver()
class StoreAdminResolver {
  constructor(@Inject(StoreService) private stores: StoreService) {}

  @Mutation()
  @Transaction()
  @Allow(Permission.SuperAdmin)
  registerStore(@Ctx() ctx: RequestContext, @Args("input") input: CreateStoreInput) {
    return this.stores.createStore(ctx, input);
  }

  @Query()
  @Allow(Permission.ReadChannel)
  storeUrl(@Ctx() ctx: RequestContext) {
    if (ctx.channel.code === DEFAULT_CHANNEL_CODE) return null;
    return (process.env.STOREFRONT_URL ?? "http://{tienda}.spora.localhost:4000").replace(
      "{tienda}",
      ctx.channel.token,
    );
  }

  @Mutation()
  @Allow(updateStoreSettingsPermission.Permission)
  updateStoreSettings(@Ctx() ctx: RequestContext, @Args("input") input: StoreSettingsInput) {
    return this.stores.updateSettings(ctx, input);
  }
}

/** Comercios y tiendas: alta, estados (`pendiente`, `activo`, `suspendido`) y bloqueo de tiendas no activas. */
@VendurePlugin({
  imports: [PluginCommonModule],
  providers: [StoreService],
  exports: [StoreService],
  adminApiExtensions: { schema: adminApi, resolvers: [StoreAdminResolver] },
  configuration: (config) => {
    config.authOptions.customPermissions.push(updateStoreSettingsPermission);
    config.customFields.Seller.push({
      name: "status",
      type: "string",
      defaultValue: "pendiente",
      label: es("Estado"),
      description: es("Solo un comercio activo publica su tienda."),
      options: sellerStatuses.map((value) => ({ value, label: es(value) })),
      requiresPermission: Permission.SuperAdmin,
    });
    // El tema y los textos de la tienda (ADR 0005). El comercio los edita en "Mi tienda" del Panel Spora
    // (updateStoreSettings); solo el admin de Spora guarda el canal.
    const tab = { tab: "Tienda" };
    const text = (name: string, label: string, ui: Record<string, unknown> = tab) =>
      ({ name, type: "text", nullable: true, label: es(label), ui }) as const;
    config.customFields.Channel.push(
      { name: "storeName", type: "string", nullable: true, label: es("Nombre de la tienda"), ui: tab },
      {
        name: "designStyle",
        type: "string",
        defaultValue: "suave",
        label: es("Estilo de diseño"),
        options: designStyles.map((value) => ({ value, label: es(value) })),
        ui: tab,
      },
      // Paleta de 5 roles (@spora/themes). El comercio la elige en "Mi tienda", con vista previa y avisos de contraste.
      ...paletteRoles.map((role) => ({
        name: paletteField(role),
        type: "string" as const,
        nullable: true,
        pattern: "^#[0-9a-fA-F]{6}$",
        label: es(`Paleta: ${paletteLabels[role].name.toLowerCase()}`),
        description: es(`${paletteLabels[role].use[0]!.toUpperCase()}${paletteLabels[role].use.slice(1)}.`),
        ui: tab,
      })),
      {
        name: "font",
        type: "string",
        defaultValue: "sistema",
        label: es("Tipografía"),
        options: Object.keys(fonts).map((value) => ({ value, label: es(value) })),
        ui: tab,
      },
      { name: "logo", type: "relation", entity: Asset, nullable: true, label: es("Logo"), ui: tab },
      { name: "tagline", type: "string", nullable: true, label: es("Frase de la tienda"), ui: tab },
      text("about", "Sobre la tienda", { ...tab, component: "textarea-form-input" }),
      { name: "contactEmail", type: "string", nullable: true, label: es("Correo de contacto"), ui: tab },
      { name: "contactPhone", type: "string", nullable: true, label: es("Teléfono o WhatsApp"), ui: tab },
      text("shippingPolicy", "Política de envíos", { ...tab, component: "textarea-form-input" }),
      text("returnsPolicy", "Política de cambios y devoluciones", { ...tab, component: "textarea-form-input" }),
      text("privacyPolicy", "Política de privacidad", { ...tab, component: "textarea-form-input" }),
    );
    return config;
  },
  compatibility: "^3.0.0",
})
export class SellersPlugin implements NestModule {
  constructor(@Inject(ConfigService) private config: ConfigService) {}

  // Se monta aquí (no en apiOptions.middleware) para que el middleware tenga acceso a StoreService.
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ActiveStoreMiddleware).forRoutes(this.config.apiOptions.shopApiPath);
  }
}
