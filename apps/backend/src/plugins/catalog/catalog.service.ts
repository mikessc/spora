import { Inject, Injectable } from "@nestjs/common";
import { type ID, Product, type RequestContext, TransactionalConnection, UserInputError } from "@vendure/core";
import { slugify } from "@spora/shared";
import { Brand, type BrandStatus, MarketplaceCategory } from "./entities";

@Injectable()
export class CatalogService {
  constructor(@Inject(TransactionalConnection) private connection: TransactionalConnection) {}

  categories(ctx: RequestContext) {
    return this.connection.getRepository(ctx, MarketplaceCategory).find({ order: { position: "ASC", name: "ASC" } });
  }

  async createCategory(ctx: RequestContext, input: { name: string; parentId?: ID | null; position?: number }) {
    const repo = this.connection.getRepository(ctx, MarketplaceCategory);
    const parent = input.parentId ? await repo.findOneByOrFail({ id: input.parentId }) : null;
    const slug = parent ? `${parent.slug}-${slugify(input.name)}` : slugify(input.name);
    if (!slug) throw new UserInputError("El nombre de la categoría no puede quedar vacío");
    return repo.save(new MarketplaceCategory({ name: input.name, slug, parent, position: input.position ?? 0 }));
  }

  brands(ctx: RequestContext, status?: BrandStatus | null) {
    return this.connection.getRepository(ctx, Brand).find({ where: status ? { status } : {}, order: { name: "ASC" } });
  }

  /** La tienda propone una marca. Si ya existe (o fue fusionada) devuelve la vigente, así no se duplican. */
  async proposeBrand(ctx: RequestContext, name: string): Promise<Brand> {
    const repo = this.connection.getRepository(ctx, Brand);
    const slug = slugify(name);
    if (!slug) throw new UserInputError("El nombre de la marca no puede quedar vacío");
    const existing = await repo.findOneBy({ slug });
    if (!existing) return repo.save(new Brand({ name: name.trim(), slug, status: "propuesta" }));
    if (existing.status === "fusionada" && existing.mergedIntoId)
      return repo.findOneByOrFail({ id: existing.mergedIntoId });
    return existing;
  }

  async approveBrand(ctx: RequestContext, id: ID): Promise<Brand> {
    const repo = this.connection.getRepository(ctx, Brand);
    const brand = await repo.findOneByOrFail({ id });
    if (brand.status === "fusionada") throw new UserInputError("Una marca fusionada no se puede aprobar");
    brand.status = "aprobada";
    return repo.save(brand);
  }

  /**
   * Spora rechaza una marca propuesta (o una aprobada por error): los productos que la usaban quedan sin marca. Se
   * puede volver a aprobar.
   */
  async rejectBrand(ctx: RequestContext, id: ID): Promise<Brand> {
    const repo = this.connection.getRepository(ctx, Brand);
    const brand = await repo.findOneByOrFail({ id });
    if (brand.status === "fusionada") throw new UserInputError("Una marca fusionada no se puede rechazar");
    await this.connection
      .getRepository(ctx, Product)
      .update({ customFields: { brand: brand.slug } }, { customFields: { brand: null } });
    brand.status = "rechazada";
    return repo.save(brand);
  }

  /** Fusiona `source` en `target`: los productos de todas las tiendas pasan a `target`. */
  async mergeBrands(ctx: RequestContext, sourceId: ID, targetId: ID): Promise<Brand> {
    const repo = this.connection.getRepository(ctx, Brand);
    if (String(sourceId) === String(targetId)) throw new UserInputError("No se puede fusionar una marca consigo misma");
    const [source, target] = await Promise.all([
      repo.findOneByOrFail({ id: sourceId }),
      repo.findOneByOrFail({ id: targetId }),
    ]);
    if (target.status === "fusionada") throw new UserInputError("La marca destino ya fue fusionada en otra");
    await this.connection
      .getRepository(ctx, Product)
      .update({ customFields: { brand: source.slug } }, { customFields: { brand: target.slug } });
    // Las marcas que ya apuntaban a `source` pasan a `target`, para no dejar cadenas.
    await repo.update({ mergedIntoId: source.id as number }, { mergedIntoId: target.id as number });
    source.status = "fusionada";
    source.mergedIntoId = target.id as number;
    await repo.save(source);
    if (target.status === "propuesta") {
      target.status = "aprobada";
      await repo.save(target);
    }
    return target;
  }
}
