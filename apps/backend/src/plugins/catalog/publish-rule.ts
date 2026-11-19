import { Product, UserInputError } from "@vendure/core";
import { type EntitySubscriberInterface, EventSubscriber, type InsertEvent, type UpdateEvent } from "typeorm";

/**
 * Regla del PLAN §3.3: todo producto publicado tiene categoría global. Se aplica al guardar, así vale para el Admin
 * UI, la API y el importador.
 */
// TypeORM solo instancia los subscribers que llevan @EventSubscriber(), aunque vengan en la config.
@EventSubscriber()
export class ProductPublishRule implements EntitySubscriberInterface<Product> {
  listenTo() {
    return Product;
  }
  beforeInsert(event: InsertEvent<Product>) {
    const { enabled, deletedAt, customFields } = event.entity;
    assertPublishable({ enabled, deletedAt, category: customFields?.marketplaceCategory });
  }
  beforeUpdate(event: UpdateEvent<Product>) {
    // En un `update()` parcial (p. ej. la fusión de marcas) no viene `enabled`: no hay nada que validar.
    const entity = event.entity as Partial<Product> | undefined;
    if (!entity || !("enabled" in entity)) return;
    // Si la actualización no trae la categoría (Vendure no siempre manda los custom fields), vale la ya guardada.
    const saved = event.databaseEntity as Product | undefined;
    const sent = entity.customFields as Partial<Product["customFields"]> | undefined;
    assertPublishable({
      enabled: entity.enabled,
      deletedAt: entity.deletedAt ?? saved?.deletedAt ?? null,
      category:
        sent && "marketplaceCategory" in sent ? sent.marketplaceCategory : saved?.customFields?.marketplaceCategory,
    });
  }
}

export function assertPublishable(product: { enabled?: boolean; deletedAt?: Date | null; category?: string | null }) {
  if (product.enabled && !product.deletedAt && !product.category) {
    throw new UserInputError("Asigne una categoría global al producto antes de publicarlo");
  }
}
