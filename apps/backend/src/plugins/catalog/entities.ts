import { type DeepPartial, VendureEntity } from "@vendure/core";
import { Column, Entity, ManyToOne } from "typeorm";

// Tipos de columna explícitos: tsx/esbuild no emiten la metadata de decoradores que TypeORM usaría para inferirlos.

/** Categoría global del marketplace (árbol curado por Spora). Moda › Mujer › Vestidos. */
@Entity()
export class MarketplaceCategory extends VendureEntity {
  constructor(input?: DeepPartial<MarketplaceCategory>) {
    super(input);
  }

  @Column("varchar") name!: string;

  /** Identificador estable que guardan productos y colecciones: `moda-mujer-vestidos`. */
  @Column("varchar", { unique: true }) slug!: string;

  @ManyToOne(() => MarketplaceCategory, { nullable: true, onDelete: "RESTRICT" })
  parent!: MarketplaceCategory | null;

  @Column("int", { nullable: true }) parentId!: number | null;

  @Column("int", { default: 0 }) position!: number;
}

export type BrandStatus = "propuesta" | "aprobada" | "rechazada" | "fusionada";

/** Marca del catálogo global. La tienda propone; Spora aprueba, rechaza o fusiona duplicados. */
@Entity()
export class Brand extends VendureEntity {
  constructor(input?: DeepPartial<Brand>) {
    super(input);
  }

  @Column("varchar") name!: string;

  @Column("varchar", { unique: true }) slug!: string;

  @Column("varchar", { default: "propuesta" }) status!: BrandStatus;

  @ManyToOne(() => Brand, { nullable: true, onDelete: "SET NULL" })
  mergedInto!: Brand | null;

  @Column("int", { nullable: true }) mergedIntoId!: number | null;
}
