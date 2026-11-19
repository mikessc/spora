// Las islas de la tienda: componentes de @spora/ui conectados a la API. Las usan el servidor (island) y el
// navegador (islandComponent) con el mismo nombre.
import { createShopClient } from "@spora/api-client";
import { AddToCart, type AddToCartProps, Gallery, VariantSelector } from "@spora/ui";

export type AddToCartIslandProps = Omit<AddToCartProps, "onAdd">;

/** En el navegador se habla con Vendure por el proxy `/shop-api` del storefront (misma cookie de sesión). */
const browserShop = () => createShopClient({ url: "/shop-api" });

export const islands = {
  gallery: Gallery,
  variants: VariantSelector,
  "add-to-cart": (props: AddToCartIslandProps) =>
    AddToCart({ ...props, onAdd: (variantId) => browserShop().addItemToOrder(variantId) }),
};
