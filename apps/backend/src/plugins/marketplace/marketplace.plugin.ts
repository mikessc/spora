import { Inject, Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import { Mutation, Resolver } from "@nestjs/graphql";
import {
  Allow,
  Channel,
  ChannelEvent,
  CollectionModificationEvent,
  ConfigService,
  EventBus,
  Logger,
  Permission,
  PluginCommonModule,
  ProductEvent,
  ProductVariantEvent,
  SellerEvent,
  StockMovementEvent,
  TransactionalConnection,
  VendurePlugin,
} from "@vendure/core";
import { DEFAULT_CHANNEL_CODE } from "@vendure/common/lib/shared-constants";
import { createShopClient, ShopApiError } from "@spora/api-client";
import { PRODUCTS_INDEX, STORES_INDEX } from "@spora/shared";
import gql from "graphql-tag";
import { MeiliSearch } from "meilisearch";
import { Brand, MarketplaceCategory } from "../catalog/entities";
import { categoryPaths, toMarketplaceDocuments } from "./documents";

/**
 * Índice global del marketplace (PLAN §2): productos de todas las tiendas activas en Meilisearch. Cada tienda se lee
 * por su Shop API (la misma que usa el storefront: lo que se ve en la tienda es lo que se indexa).
 */
@Injectable()
export class MarketplaceIndexService implements OnApplicationBootstrap {
  private client: MeiliSearch | null = null;
  private pending = new Map<string, NodeJS.Timeout>();

  constructor(
    @Inject(TransactionalConnection) private connection: TransactionalConnection,
    @Inject(ConfigService) private config: ConfigService,
    @Inject(EventBus) private events: EventBus,
  ) {}

  async onApplicationBootstrap() {
    const host = process.env.MEILI_HOST ?? "http://localhost:7700";
    if (!host) return Logger.warn("Sin MEILI_HOST: el índice del marketplace está apagado", "Spora");
    this.client = new MeiliSearch({ host, apiKey: process.env.MEILI_MASTER_KEY ?? "solo-desarrollo-meili" });
    await this.client
      .index(PRODUCTS_INDEX)
      .updateSettings({
        searchableAttributes: ["name", "brandName", "storeName", "description"],
        filterableAttributes: ["categories", "brand", "storeToken", "attributes", "priceCrc", "currency", "available"],
        sortableAttributes: ["priceCrc", "name"],
      })
      // Se espera: reindexStore filtra por storeToken, y el índice tiene que existir con ese filtro.
      .waitTask()
      .catch((err) => Logger.error(`Meilisearch: ${String(err)}`, "Spora"));
    await this.client
      .index(STORES_INDEX)
      .updateSettings({ searchableAttributes: ["name", "tagline"], filterableAttributes: ["categories"] })
      .catch(() => undefined);

    // Cada cambio de catálogo, stock o tienda reindexa la tienda afectada (agrupando ráfagas de eventos).
    const onStore = (e: { ctx: { channel: Channel } }) => this.schedule(e.ctx.channel.token);
    this.events.ofType(ProductEvent).subscribe(onStore);
    this.events.ofType(ProductVariantEvent).subscribe(onStore);
    this.events.ofType(StockMovementEvent).subscribe(onStore);
    this.events.ofType(CollectionModificationEvent).subscribe(onStore);
    // Estado del comercio o datos del canal: se revisan todas (pocas tiendas en el MVP).
    this.events.ofType(ChannelEvent).subscribe(() => this.schedule("*"));
    this.events.ofType(SellerEvent).subscribe(() => this.schedule("*"));
  }

  private schedule(token: string | undefined) {
    if (!this.client || !token) return;
    clearTimeout(this.pending.get(token));
    this.pending.set(
      token,
      setTimeout(() => {
        this.pending.delete(token);
        (token === "*" ? this.reindexAll() : this.reindexStore(token)).catch((err) =>
          Logger.error(`Índice del marketplace (${token}): ${String(err)}`, "Spora"),
        );
      }, 500),
    );
  }

  /** Reindexa todas las tiendas (y saca las que ya no existen o no están activas). */
  async reindexAll() {
    if (!this.client) return;
    const channels = await this.connection.rawConnection.getRepository(Channel).find();
    const stores = channels.filter((c) => c.code !== DEFAULT_CHANNEL_CODE).map((c) => c.token);
    for (const token of stores) await this.reindexStore(token);
  }

  async reindexStore(token: string) {
    if (!this.client || token === DEFAULT_CHANNEL_CODE) return;
    const { port, shopApiPath } = this.config.apiOptions;
    const shop = createShopClient({ url: `http://localhost:${port}/${shopApiPath}`, channelToken: token });
    const products = this.client.index(PRODUCTS_INDEX);
    const filter = `storeToken = "${token.replace(/"/g, "")}"`;
    let store;
    try {
      store = await shop.store();
    } catch (err) {
      // Tienda pendiente, suspendida o borrada: queda fuera del marketplace (solo `activo` publica).
      if (err instanceof ShopApiError && ["STORE_NOT_ACTIVE", "CHANNEL_NOT_FOUND"].includes(err.code ?? "")) {
        await products.deleteDocuments({ filter });
        await this.client.index(STORES_INDEX).deleteDocument(token);
        return;
      }
      throw err;
    }
    const [catalog, rate, categories, brands] = await Promise.all([
      shop.catalog(),
      shop.exchangeRate(),
      this.connection.rawConnection.getRepository(MarketplaceCategory).find({ relations: { parent: true } }),
      this.connection.rawConnection.getRepository(Brand).findBy({ status: "aprobada" }),
    ]);
    const docs = toMarketplaceDocuments(store, catalog, {
      paths: categoryPaths(categories.map((c) => ({ slug: c.slug, parentSlug: c.parent?.slug ?? null }))),
      brandNames: new Map(brands.map((b) => [b.slug, b.name])),
      rate: rate.rate,
    });
    // Primero se reemplaza y después se borra lo que ya no está (Meilisearch aplica las tareas en orden): mientras se
    // reindexa, la tienda nunca desaparece del marketplace.
    // ponytail: hasta 10 000 productos por tienda; más allá, paginar getDocuments.
    const { results: indexed } = await products.getDocuments<{ id: string }>({ filter, fields: ["id"], limit: 10_000 });
    const keep = new Set(docs.products.map((p) => p.id));
    if (docs.products.length) await products.addDocuments(docs.products, { primaryKey: "id" });
    const gone = indexed.map((d) => d.id).filter((id) => !keep.has(id));
    if (gone.length) await products.deleteDocuments(gone);
    await this.client.index(STORES_INDEX).addDocuments([docs.store], { primaryKey: "id" });
  }
}

@Resolver()
class MarketplaceAdminResolver {
  constructor(@Inject(MarketplaceIndexService) private index: MarketplaceIndexService) {}

  @Mutation()
  @Allow(Permission.SuperAdmin)
  async reindexMarketplace() {
    await this.index.reindexAll();
    return true;
  }
}

/** Marketplace (PLAN §2, M6): índice global en Meilisearch alimentado por eventos de Vendure. */
@VendurePlugin({
  imports: [PluginCommonModule],
  providers: [MarketplaceIndexService],
  exports: [MarketplaceIndexService],
  adminApiExtensions: {
    schema: gql`
      extend type Mutation {
        "Reconstruye el índice del marketplace con todas las tiendas activas."
        reindexMarketplace: Boolean!
      }
    `,
    resolvers: [MarketplaceAdminResolver],
  },
  compatibility: "^3.0.0",
})
export class MarketplacePlugin {}
