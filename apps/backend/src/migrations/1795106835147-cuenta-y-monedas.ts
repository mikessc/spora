import {MigrationInterface, QueryRunner} from "typeorm";

export class CuentaYMonedas1795106835147 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`CREATE TABLE "exchange_rate" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "date" character varying NOT NULL, "rate" character varying NOT NULL, "source" character varying NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "UQ_ffa32005d59de0f0109411d0a6d" UNIQUE ("date"), CONSTRAINT "PK_5c5d27d2b900ef6cdeef0398472" PRIMARY KEY ("id"))`, undefined);
        await queryRunner.query(`ALTER TABLE "order" ADD "customFieldsExchangerate" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "order" ADD "customFieldsExchangeratedate" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" ADD "customFieldsOthercurrencyprice" integer`, undefined);
        await queryRunner.query(`ALTER TABLE "address" ADD "customFieldsDistrict" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "address" ADD "customFieldsDistrictcode" character varying(255)`, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "address" DROP COLUMN "customFieldsDistrictcode"`, undefined);
        await queryRunner.query(`ALTER TABLE "address" DROP COLUMN "customFieldsDistrict"`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" DROP COLUMN "customFieldsOthercurrencyprice"`, undefined);
        await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "customFieldsExchangeratedate"`, undefined);
        await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "customFieldsExchangerate"`, undefined);
        await queryRunner.query(`DROP TABLE "exchange_rate"`, undefined);
   }

}
