import { MigrationInterface, QueryRunner } from "typeorm";

export class Comisiones1795119922995 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `CREATE TABLE "commission_agreement" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "sellerId" integer NOT NULL, "percentage" character varying NOT NULL, "validFrom" character varying NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_324d9502140cc2398a8096c4c63" PRIMARY KEY ("id"))`,
      undefined,
    );
    await queryRunner.query(
      `CREATE TABLE "commission_entry" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "orderId" integer NOT NULL, "orderCode" character varying NOT NULL, "sellerId" integer NOT NULL, "channelId" integer NOT NULL, "storeName" character varying NOT NULL, "currency" character varying NOT NULL, "baseAmount" integer NOT NULL, "percentage" character varying NOT NULL, "amount" integer NOT NULL, "status" character varying NOT NULL DEFAULT 'pendiente', "placedAt" TIMESTAMP NOT NULL, "billableAt" TIMESTAMP, "billingMonth" character varying, "invoiceId" integer, "id" SERIAL NOT NULL, CONSTRAINT "UQ_3514d175edfeea2b13e6c7a7c34" UNIQUE ("orderId"), CONSTRAINT "PK_751d30b4bba04cd95e629ddf79d" PRIMARY KEY ("id"))`,
      undefined,
    );
    await queryRunner.query(
      `CREATE TABLE "commission_invoice" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "sellerId" integer NOT NULL, "month" character varying NOT NULL, "currency" character varying NOT NULL, "total" integer NOT NULL, "entryCount" integer NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_35da64fced7def71b548bcb5f2c" PRIMARY KEY ("id"))`,
      undefined,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`DROP TABLE "commission_invoice"`, undefined);
    await queryRunner.query(`DROP TABLE "commission_entry"`, undefined);
    await queryRunner.query(`DROP TABLE "commission_agreement"`, undefined);
  }
}
