import {
  convertMoney,
  formatMoney,
  type Money,
  type OptionGroup,
  otherCurrency,
  type StockLevel,
  type Variant,
} from "@spora/shared";
import { derived, div, fieldset, input, label, legend, p, signal, span } from "sibujs";
import { emitVariant } from "./variant-event";

export interface VariantSelectorProps {
  optionGroups: OptionGroup[];
  variants: Variant[];
  initialVariantId: string;
  /** Colones por dólar del día, para mostrar el precio aproximado en la otra moneda (`null`: no se muestra). */
  exchangeRate?: string | null;
}

/** Precio en la otra moneda: el manual del comercio si lo puso, si no la conversión con el tipo de cambio. */
export function otherPrice(variant: Variant, rate: string | null | undefined): Money | null {
  const currency = otherCurrency(variant.price.currency);
  if (variant.otherCurrencyPrice != null) return { amount: variant.otherCurrencyPrice, currency };
  return rate ? convertMoney(variant.price, currency, rate) : null;
}

const STOCK_TEXT: Record<StockLevel, string> = {
  IN_STOCK: "Disponible",
  LOW_STOCK: "Últimas unidades",
  OUT_OF_STOCK: "Agotado",
};

export function VariantSelector({ optionGroups, variants, initialVariantId, exchangeRate }: VariantSelectorProps) {
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
    emitVariant(
      v ? { id: v.id, featuredAssetId: v.featuredAssetId, available: v.stockLevel !== "OUT_OF_STOCK" } : null,
    );
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
    p("variants__other-price", () => {
      const v = variant();
      const other = v && otherPrice(v, exchangeRate);
      return other ? `≈ ${formatMoney(other)}` : "";
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
