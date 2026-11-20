import { paletteFromPrimary } from "@spora/themes";
import { MigrationInterface, QueryRunner } from "typeorm";

const COLUMNS = {
  primary: "customFieldsPaletteprimary",
  secondary: "customFieldsPalettesecondary",
  accent: "customFieldsPaletteaccent",
  background: "customFieldsPalettebackground",
  text: "customFieldsPalettetext",
} as const;

/**
 * Paleta de 5 colores por tienda en lugar de primaryColor. Las tiendas que tenían color de marca reciben una paleta
 * derivada de él (paletteFromPrimary); las que no, quedan con la de Spora (columnas vacías).
 */
export class PaletaDeCincoColores1795163637529 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    for (const column of Object.values(COLUMNS)) {
      await queryRunner.query(`ALTER TABLE "channel" ADD "${column}" character varying(255)`, undefined);
    }
    const rows: { id: number; primary: string | null }[] = await queryRunner.query(
      `SELECT "id", "customFieldsPrimarycolor" AS "primary" FROM "channel" WHERE "customFieldsPrimarycolor" IS NOT NULL`,
    );
    for (const row of rows) {
      const palette = paletteFromPrimary(row.primary!);
      const entries = Object.entries(COLUMNS);
      await queryRunner.query(
        `UPDATE "channel" SET ${entries.map(([, column], i) => `"${column}" = $${i + 1}`).join(", ")} WHERE "id" = $${entries.length + 1}`,
        [...entries.map(([role]) => palette[role as keyof typeof COLUMNS]), row.id],
      );
    }
    await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "customFieldsPrimarycolor"`, undefined);
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`ALTER TABLE "channel" ADD "customFieldsPrimarycolor" character varying(255)`, undefined);
    await queryRunner.query(`UPDATE "channel" SET "customFieldsPrimarycolor" = "${COLUMNS.primary}"`, undefined);
    for (const column of Object.values(COLUMNS)) {
      await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "${column}"`, undefined);
    }
  }
}
