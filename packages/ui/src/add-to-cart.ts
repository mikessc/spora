import { formatMoney, type Money } from "@spora/shared";
import { div, onMount, p, signal } from "sibujs";
import { Button } from "sibujs-ui";
import { onVariant, type SelectedVariant } from "./variant-event";

export interface AddToCartProps {
  variant: SelectedVariant | null;
  /** Lo conecta la app (el componente no conoce la API). En el servidor no se llama nunca. */
  onAdd: (variantId: string) => Promise<{ totalQuantity: number; total: Money }>;
}

type Status = "idle" | "adding" | "done" | "error";

export function AddToCart(props: AddToCartProps) {
  const [variant, setVariant] = signal(props.variant);
  const [status, setStatus] = signal<Status>("idle");
  const [message, setMessage] = signal("");

  async function add() {
    const v = variant();
    if (!v?.available || status() === "adding") return;
    setStatus("adding");
    try {
      const cart = await props.onAdd(v.id);
      setStatus("done");
      setMessage(`Agregado. Carrito: ${cart.totalQuantity} artículo(s), ${formatMoney(cart.total)}.`);
    } catch {
      setStatus("error");
      setMessage("No se pudo agregar al carrito. Intente de nuevo.");
    }
  }

  const root = div("add-to-cart", [
    Button(
      {
        class: "add-to-cart__button",
        size: "lg",
        disabled: () => !variant()?.available || status() === "adding",
        on: { click: add },
      },
      [() => (status() === "adding" ? "Agregando…" : variant()?.available ? "Agregar al carrito" : "Agotado")],
    ),
    p({ class: "add-to-cart__status", role: "status", "data-status": status }, () => message()),
  ]);

  onMount(
    () =>
      onVariant((v) => {
        setVariant(v);
        setStatus("idle");
        setMessage("");
      }),
    root,
  );
  return root;
}
