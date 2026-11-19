import {MigrationInterface, QueryRunner} from "typeorm";

export class EntregaConfirmada1795127801658 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "order" ADD "customFieldsCustomerdeliveryreport" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "commission_entry" ADD "closedWithoutDelivery" boolean NOT NULL DEFAULT false`, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "commission_entry" DROP COLUMN "closedWithoutDelivery"`, undefined);
        await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "customFieldsCustomerdeliveryreport"`, undefined);
   }

}
