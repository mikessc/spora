import { createShopClient } from "@spora/api-client";
import { div, onMount, p, signal } from "sibujs";
import { Button } from "sibujs-ui";
import { formatMoney } from "../money";
import { onVariant, type SelectedVariant } from "./variant-event";

export interface AddToCartProps {
  variant: SelectedVariant | null;
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
      // En el navegador se habla con Vendure vía el proxy del storefront (misma cookie de sesión).
      const cart = await createShopClient({ url: "/shop-api" }).addItemToOrder(v.id, 1);
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
