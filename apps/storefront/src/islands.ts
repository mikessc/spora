// Las islas de la tienda. Las de componente (galería, selector, carrito) las renderiza el servidor con `island()` y el
// navegador las adopta con `islandComponent()`. Las de mejora (`enhance`) se enganchan a HTML que ya existe.
import { createShopClient } from "@spora/api-client";
import { AddToCart, type AddToCartProps, Gallery, onCart, VariantSelector } from "@spora/ui";
import { type EnhanceContext, signal } from "sibujs";

export type AddToCartIslandProps = Omit<AddToCartProps, "onAdd">;

/** En el navegador se habla con Vendure por el proxy `/shop-api` del storefront (misma cookie de sesión). */
const browserShop = () => createShopClient({ url: "/shop-api" });

export const islands = {
  gallery: Gallery,
  variants: VariantSelector,
  "add-to-cart": (props: AddToCartIslandProps) =>
    AddToCart({ ...props, onAdd: (variantId) => browserShop().addItemToOrder(variantId) }),
};

export const enhancements = {
  /** Filtros: el formulario GET se envía solo al marcar una casilla. */
  filters: (ctx: EnhanceContext) => {
    ctx.on(null, "change", () => (ctx.root as HTMLFormElement).requestSubmit());
  },
  /** Contador del carrito del encabezado: parte del número que trajo el servidor (sin parpadeo). */
  "cart-count": (ctx: EnhanceContext) => {
    const [count, setCount] = signal(Number(ctx.ref("@count")?.textContent ?? 0));
    ctx.text("@count", () => String(count()));
    ctx.cleanup(onCart(setCount));
  },
};
