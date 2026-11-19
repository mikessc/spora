import { Inject } from "@nestjs/common";
import { Args, Mutation, Query, Resolver } from "@nestjs/graphql";
import {
  Allow,
  Ctx,
  type ID,
  type Injector,
  LanguageCode,
  Permission,
  PluginCommonModule,
  type RequestContext,
  Transaction,
  TransactionalConnection,
  VendurePlugin,
} from "@vendure/core";
import { type CommonAttribute, commonAttributes } from "@spora/shared";
import gql from "graphql-tag";
import { CatalogService } from "./catalog.service";
import { Brand, type BrandStatus, MarketplaceCategory } from "./entities";
import { ProductPublishRule } from "./publish-rule";

declare module "@vendure/core/dist/entity/custom-entity-fields" {
  interface CustomProductFields {
    marketplaceCategory: string | null;
    brand: string | null;
  }
  interface CustomCollectionFields {
    marketplaceCategory: string | null;
  }
  interface CustomProductOptionGroupFields {
    attribute: CommonAttribute | null;
  }
}

const es = (value: string) => [{ languageCode: LanguageCode.es, value }];

const categoryExists = async (value: string | null, injector: Injector) => {
  if (!value) return;
  const repo = injector.get(TransactionalConnection).rawConnection.getRepository(MarketplaceCategory);
  if (!(await repo.existsBy({ slug: value }))) return `La categoría global "${value}" no existe`;
};

const brandUsable = async (value: string | null, injector: Injector) => {
  if (!value) return;
  const brand = await injector
    .get(TransactionalConnection)
    .rawConnection.getRepository(Brand)
    .findOneBy({ slug: value });
  if (!brand) return `La marca "${value}" no existe: propóngala primero`;
  if (brand.status === "fusionada") return `La marca "${value}" se fusionó en otra; use la vigente`;
};

const types = gql`
  type MarketplaceCategory {
    id: ID!
    name: String!
    slug: String!
    parentId: ID
    position: Int!
  }
  type Brand {
    id: ID!
    name: String!
    slug: String!
    status: String!
    mergedIntoId: ID
  }
`;

const adminApi = gql`
  ${types}
  input CreateMarketplaceCategoryInput {
    name: String!
    parentId: ID
    position: Int
  }
  extend type Query {
    marketplaceCategories: [MarketplaceCategory!]!
    brands(status: String): [Brand!]!
  }
  extend type Mutation {
    createMarketplaceCategory(input: CreateMarketplaceCategoryInput!): MarketplaceCategory!
    proposeBrand(name: String!): Brand!
    approveBrand(id: ID!): Brand!
    mergeBrands(sourceId: ID!, targetId: ID!): Brand!
  }
`;

const shopApi = gql`
  ${types}
  extend type Query {
    marketplaceCategories: [MarketplaceCategory!]!
    "Solo marcas aprobadas."
    brands: [Brand!]!
  }
`;

@Resolver()
class CatalogAdminResolver {
  constructor(@Inject(CatalogService) private catalog: CatalogService) {}

  @Query()
  @Allow(Permission.ReadCatalog, Permission.ReadProduct)
  marketplaceCategories(@Ctx() ctx: RequestContext) {
    return this.catalog.categories(ctx);
  }

  @Query()
  @Allow(Permission.ReadCatalog, Permission.ReadProduct)
  brands(@Ctx() ctx: RequestContext, @Args("status") status?: BrandStatus) {
    return this.catalog.brands(ctx, status);
  }

  @Mutation()
  @Transaction()
  @Allow(Permission.SuperAdmin)
  createMarketplaceCategory(
    @Ctx() ctx: RequestContext,
    @Args("input") input: { name: string; parentId?: ID; position?: number },
  ) {
    return this.catalog.createCategory(ctx, input);
  }

  @Mutation()
  @Transaction()
  @Allow(Permission.CreateCatalog, Permission.CreateProduct)
  proposeBrand(@Ctx() ctx: RequestContext, @Args("name") name: string) {
    return this.catalog.proposeBrand(ctx, name);
  }

  @Mutation()
  @Transaction()
  @Allow(Permission.SuperAdmin)
  approveBrand(@Ctx() ctx: RequestContext, @Args("id") id: ID) {
    return this.catalog.approveBrand(ctx, id);
  }

  @Mutation()
  @Transaction()
  @Allow(Permission.SuperAdmin)
  mergeBrands(@Ctx() ctx: RequestContext, @Args("sourceId") sourceId: ID, @Args("targetId") targetId: ID) {
    return this.catalog.mergeBrands(ctx, sourceId, targetId);
  }
}

@Resolver()
class CatalogShopResolver {
  constructor(@Inject(CatalogService) private catalog: CatalogService) {}

  @Query()
  marketplaceCategories(@Ctx() ctx: RequestContext) {
    return this.catalog.categories(ctx);
  }

  @Query()
  brands(@Ctx() ctx: RequestContext) {
    return this.catalog.brands(ctx, "aprobada");
  }
}

/** Catálogo global de Spora: categorías del marketplace, marcas curadas, atributos comunes y la regla de publicación. */
@VendurePlugin({
  imports: [PluginCommonModule],
  entities: [MarketplaceCategory, Brand],
  providers: [CatalogService],
  adminApiExtensions: { schema: adminApi, resolvers: [CatalogAdminResolver] },
  shopApiExtensions: { schema: shopApi, resolvers: [CatalogShopResolver] },
  configuration: (config) => {
    config.dbConnectionOptions = {
      ...config.dbConnectionOptions,
      subscribers: [...((config.dbConnectionOptions.subscribers as []) ?? []), ProductPublishRule],
    };
    config.customFields.Product.push(
      {
        name: "marketplaceCategory",
        type: "string",
        nullable: true,
        label: es("Categoría global"),
        description: es(
          "Slug de la categoría del marketplace (p. ej. moda-hombre-camisetas). Obligatoria para publicar.",
        ),
        validate: categoryExists,
      },
      {
        name: "brand",
        type: "string",
        nullable: true,
        label: es("Marca"),
        description: es("Slug de una marca del catálogo de Spora. Si no existe, propóngala."),
        validate: brandUsable,
      },
    );
    config.customFields.Collection.push({
      name: "marketplaceCategory",
      type: "string",
      nullable: true,
      label: es("Categoría global"),
      description: es("Categoría del marketplace a la que corresponde esta categoría de la tienda."),
      validate: categoryExists,
    });
    config.customFields.ProductOptionGroup.push({
      name: "attribute",
      type: "string",
      nullable: true,
      label: es("Atributo común"),
      description: es("Hace que este grupo de opciones filtre junto con el de otras tiendas."),
      options: Object.entries(commonAttributes).map(([value, label]) => ({ value, label: es(label) })),
    });
    return config;
  },
  compatibility: "^3.0.0",
})
export class CatalogPlugin {}
