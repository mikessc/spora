import { MigrationInterface, QueryRunner } from "typeorm";

export class Pagos1795115855912 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`ALTER TABLE "order" ADD "customFieldsPaymentreceiptid" integer`, undefined);
    await queryRunner.query(
      `ALTER TABLE "order" ADD CONSTRAINT "FK_d88bf173f1b9ab4551b731a87c2" FOREIGN KEY ("customFieldsPaymentreceiptid") REFERENCES "asset"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
      undefined,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`ALTER TABLE "order" DROP CONSTRAINT "FK_d88bf173f1b9ab4551b731a87c2"`, undefined);
    await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "customFieldsPaymentreceiptid"`, undefined);
  }
}
