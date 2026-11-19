import type { OptionGroup, StockLevel, Variant } from "@spora/api-client";
import { derived, div, fieldset, input, isSSR, label, legend, p, signal, span } from "sibujs";
import { formatMoney } from "../money";
import { emitVariant } from "./variant-event";

export interface VariantSelectorProps {
  optionGroups: OptionGroup[];
  variants: Variant[];
  initialVariantId: string;
}

const STOCK_TEXT: Record<StockLevel, string> = {
  IN_STOCK: "Disponible",
  LOW_STOCK: "Últimas unidades",
  OUT_OF_STOCK: "Agotado",
};

export function VariantSelector({ optionGroups, variants, initialVariantId }: VariantSelectorProps) {
  const groupOf = new Map(optionGroups.flatMap((g) => g.options.map((o) => [o.id, g.id] as const)));
  const initial = variants.find((v) => v.id === initialVariantId) ?? variants[0];
  const [selected, setSelected] = signal<Record<string, string>>(
    Object.fromEntries((initial?.optionIds ?? []).map((id) => [groupOf.get(id) ?? "", id])),
  );

  const findVariant = (choice: Record<string, string>) =>
    variants.find((v) => optionGroups.every((g) => v.optionIds.includes(choice[g.id] ?? "")));
  const variant = derived(() => findVariant(selected()));
  const stock = () => variant()?.stockLevel ?? "OUT_OF_STOCK";

  function choose(groupId: string, optionId: string) {
    setSelected({ ...selected(), [groupId]: optionId });
    const v = variant();
    emitVariant(v ? { id: v.id, featuredAssetId: v.featuredAssetId, available: v.stockLevel !== "OUT_OF_STOCK" } : null);
  }

  /** ¿Esta opción, con el resto de la selección actual, lleva a una variante agotada o inexistente? */
  const unavailable = (groupId: string, optionId: string) => {
    const v = findVariant({ ...selected(), [groupId]: optionId });
    return !v || v.stockLevel === "OUT_OF_STOCK";
  };

  return div("variants", [
    p("variants__price", () => {
      const v = variant();
      return v ? formatMoney(v.price) : "No disponible";
    }),
    p({ class: "variants__stock", "data-stock": stock }, () => STOCK_TEXT[stock()]),
    ...optionGroups.map((group) =>
      fieldset("variants__group", [
        legend("variants__legend", group.name),
        div(
          "variants__options",
          group.options.map((option) =>
            label(
              {
                class: "variants__option",
                "data-unavailable": () => (unavailable(group.id, option.id) ? "true" : null),
              },
              [
                input({
                  class: "variants__radio",
                  type: "radio",
                  name: `opcion-${group.id}`,
                  value: option.id,
                  checked: () => selected()[group.id] === option.id,
                  // `checked` es estado (propiedad IDL) y el SSR no lo serializa: el HTML llegaría sin
                  // talla/color marcados y el chip cambiaría al hidratar. En el servidor va también como atributo.
                  onElement: (el) => {
                    if (isSSR() && selected()[group.id] === option.id) el.setAttribute("checked", "");
                  },
                  on: { change: () => choose(group.id, option.id) },
                }),
                span("variants__label", option.name),
              ],
            ),
          ),
        ),
      ]),
    ),
  ]);
}
