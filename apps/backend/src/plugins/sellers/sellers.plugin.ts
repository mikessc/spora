import { Inject, Injectable, type MiddlewareConsumer, type NestMiddleware, type NestModule } from "@nestjs/common";
import { Args, Mutation, Resolver } from "@nestjs/graphql";
import {
  Allow,
  ConfigService,
  Ctx,
  LanguageCode,
  Permission,
  PluginCommonModule,
  type RequestContext,
  Transaction,
  VendurePlugin,
} from "@vendure/core";
import { designStyles } from "@spora/themes";
import type { NextFunction, Request, Response } from "express";
import gql from "graphql-tag";
import { type CreateStoreInput, type SellerStatus, sellerStatuses, StoreService } from "./store.service";

declare module "@vendure/core/dist/entity/custom-entity-fields" {
  interface CustomSellerFields {
    status: SellerStatus;
  }
  interface CustomChannelFields {
    storeName: string | null;
    designStyle: string;
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
    administrator: StoreAdministratorInput!
  }
  extend type Mutation {
    "Alta de comercio: crea comercio (pendiente), canal, ubicación de stock, rol limitado y usuario administrador."
    registerStore(input: RegisterStoreInput!): Channel!
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
}

/** Comercios y tiendas: alta, estados (`pendiente`, `activo`, `suspendido`) y bloqueo de tiendas no activas. */
@VendurePlugin({
  imports: [PluginCommonModule],
  providers: [StoreService],
  exports: [StoreService],
  adminApiExtensions: { schema: adminApi, resolvers: [StoreAdminResolver] },
  configuration: (config) => {
    config.customFields.Seller.push({
      name: "status",
      type: "string",
      defaultValue: "pendiente",
      label: es("Estado"),
      description: es("Solo un comercio activo publica su tienda."),
      options: sellerStatuses.map((value) => ({ value, label: es(value) })),
      requiresPermission: Permission.SuperAdmin,
    });
    config.customFields.Channel.push(
      { name: "storeName", type: "string", nullable: true, label: es("Nombre de la tienda") },
      {
        name: "designStyle",
        type: "string",
        defaultValue: "suave",
        label: es("Estilo de diseño"),
        options: designStyles.map((value) => ({ value, label: es(value) })),
      },
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
