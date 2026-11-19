import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * La base de la comisión pasa a ser sin IVA. Los movimientos que ya existen no se recalculan: quedan marcados como
 * base con IVA para que el estado de cuenta lo diga.
 */
export class BaseSinIva1795127116043 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `ALTER TABLE "commission_entry" ADD "baseIncludesTax" boolean NOT NULL DEFAULT false`,
      undefined,
    );
    await queryRunner.query(`UPDATE "commission_entry" SET "baseIncludesTax" = true`, undefined);
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`ALTER TABLE "commission_entry" DROP COLUMN "baseIncludesTax"`, undefined);
  }
}
