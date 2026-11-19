// Las islas son independientes; el selector avisa a la galería y al carrito con un evento del navegador.
export interface SelectedVariant {
  id: string;
  featuredAssetId: string | null;
  available: boolean;
}

const EVENT = "spora:variante";

export function emitVariant(variant: SelectedVariant | null): void {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: variant }));
}

/** Devuelve la función que quita el listener (sirve como cleanup de onMount). */
export function onVariant(listener: (variant: SelectedVariant | null) => void): () => void {
  const handler = (e: Event) => listener((e as CustomEvent<SelectedVariant | null>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
