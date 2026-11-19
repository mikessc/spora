import { MigrationInterface, QueryRunner } from "typeorm";

export class TemaDeTienda1795085087727 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`ALTER TABLE "channel" ADD "customFieldsPrimarycolor" character varying(255)`, undefined);
    await queryRunner.query(
      `ALTER TABLE "channel" ADD "customFieldsFont" character varying(255) DEFAULT 'sistema'`,
      undefined,
    );
    await queryRunner.query(`ALTER TABLE "channel" ADD "customFieldsTagline" character varying(255)`, undefined);
    await queryRunner.query(`ALTER TABLE "channel" ADD "customFieldsAbout" text`, undefined);
    await queryRunner.query(`ALTER TABLE "channel" ADD "customFieldsContactemail" character varying(255)`, undefined);
    await queryRunner.query(`ALTER TABLE "channel" ADD "customFieldsContactphone" character varying(255)`, undefined);
    await queryRunner.query(`ALTER TABLE "channel" ADD "customFieldsShippingpolicy" text`, undefined);
    await queryRunner.query(`ALTER TABLE "channel" ADD "customFieldsReturnspolicy" text`, undefined);
    await queryRunner.query(`ALTER TABLE "channel" ADD "customFieldsPrivacypolicy" text`, undefined);
    await queryRunner.query(`ALTER TABLE "channel" ADD "customFieldsLogoid" integer`, undefined);
    await queryRunner.query(
      `ALTER TABLE "channel" ADD CONSTRAINT "FK_47b012f4fa1cda466a854209f09" FOREIGN KEY ("customFieldsLogoid") REFERENCES "asset"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
      undefined,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`ALTER TABLE "channel" DROP CONSTRAINT "FK_47b012f4fa1cda466a854209f09"`, undefined);
    await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "customFieldsLogoid"`, undefined);
    await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "customFieldsPrivacypolicy"`, undefined);
    await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "customFieldsReturnspolicy"`, undefined);
    await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "customFieldsShippingpolicy"`, undefined);
    await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "customFieldsContactphone"`, undefined);
    await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "customFieldsContactemail"`, undefined);
    await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "customFieldsAbout"`, undefined);
    await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "customFieldsTagline"`, undefined);
    await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "customFieldsFont"`, undefined);
    await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "customFieldsPrimarycolor"`, undefined);
  }
}
