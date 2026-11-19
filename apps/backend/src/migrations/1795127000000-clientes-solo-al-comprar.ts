import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Privacidad: hasta ahora un cliente quedaba asignado a cada tienda que visitaba con la sesión iniciada. Se le quita de
 * las tiendas donde nunca hizo un pedido (sigue en el canal del marketplace). No se puede deshacer: down no hace nada.
 */
export class ClientesSoloAlComprar1795127000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `DELETE FROM "customer_channels_channel" cc
       WHERE cc."channelId" <> (SELECT "id" FROM "channel" WHERE "code" = '__default_channel__')
         AND NOT EXISTS (
           SELECT 1 FROM "order" o
           JOIN "order_channels_channel" oc ON oc."orderId" = o."id"
           WHERE o."customerId" = cc."customerId" AND oc."channelId" = cc."channelId" AND o."orderPlacedAt" IS NOT NULL
         )`,
      undefined,
    );
  }

  public async down(): Promise<any> {}
}
