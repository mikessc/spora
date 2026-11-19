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
    assertPublishable(event.entity);
  }
  beforeUpdate(event: UpdateEvent<Product>) {
    // En un `update()` parcial (p. ej. la fusión de marcas) no viene `enabled`: no hay nada que validar.
    if (event.entity && "enabled" in event.entity) assertPublishable(event.entity as Product);
  }
}

export function assertPublishable(product: Pick<Product, "enabled" | "deletedAt" | "customFields">) {
  if (product.enabled && !product.deletedAt && !product.customFields?.marketplaceCategory) {
    throw new UserInputError("Asigne una categoría global al producto antes de publicarlo");
  }
}
