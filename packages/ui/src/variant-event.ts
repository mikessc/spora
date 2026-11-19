// Las islas son independientes; se avisan con eventos del navegador.
export interface SelectedVariant {
  id: string;
  featuredAssetId: string | null;
  available: boolean;
}

const VARIANT = "spora:variante";
const CART = "spora:carrito";

function emit<T>(name: string, detail: T): void {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

/** Devuelve la función que quita el listener (sirve como cleanup de onMount o de una isla). */
function listen<T>(name: string, listener: (detail: T) => void): () => void {
  const handler = (e: Event) => listener((e as CustomEvent<T>).detail);
  window.addEventListener(name, handler);
  return () => window.removeEventListener(name, handler);
}

/** El selector avisa qué variante quedó elegida (o `null` si la combinación no existe). */
export const emitVariant = (variant: SelectedVariant | null) => emit(VARIANT, variant);
export const onVariant = (listener: (variant: SelectedVariant | null) => void) => listen(VARIANT, listener);

/** El carrito cambió: cuántos artículos tiene ahora. */
export const emitCart = (totalQuantity: number) => emit(CART, totalQuantity);
export const onCart = (listener: (totalQuantity: number) => void) => listen(CART, listener);
