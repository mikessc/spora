import {MigrationInterface, QueryRunner} from "typeorm";

export class Envios1795118172623 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`CREATE TABLE "shipment_event" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "provider" character varying NOT NULL, "eventId" character varying NOT NULL, "kind" character varying NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_225d54792e24adfffdb489fba36" PRIMARY KEY ("id"))`, undefined);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_aab6122d521c913c386748ca81" ON "shipment_event" ("provider", "eventId") `, undefined);
        await queryRunner.query(`ALTER TABLE "fulfillment" ADD "customFieldsProvider" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "fulfillment" ADD "customFieldsExternalid" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "fulfillment" ADD "customFieldsTrackingurl" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "fulfillment" ADD "customFieldsTrackingstatus" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" ADD "customFieldsWeightgrams" integer`, undefined);
        await queryRunner.query(`ALTER TABLE "channel" ADD "customFieldsTrackingappkey" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "channel" ADD "customFieldsTrackingappwebhooksecret" character varying(255)`, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "customFieldsTrackingappwebhooksecret"`, undefined);
        await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "customFieldsTrackingappkey"`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" DROP COLUMN "customFieldsWeightgrams"`, undefined);
        await queryRunner.query(`ALTER TABLE "fulfillment" DROP COLUMN "customFieldsTrackingstatus"`, undefined);
        await queryRunner.query(`ALTER TABLE "fulfillment" DROP COLUMN "customFieldsTrackingurl"`, undefined);
        await queryRunner.query(`ALTER TABLE "fulfillment" DROP COLUMN "customFieldsExternalid"`, undefined);
        await queryRunner.query(`ALTER TABLE "fulfillment" DROP COLUMN "customFieldsProvider"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_aab6122d521c913c386748ca81"`, undefined);
        await queryRunner.query(`DROP TABLE "shipment_event"`, undefined);
   }

}
