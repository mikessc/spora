// Ficha de producto. Solo corre en el servidor: lo que no es isla llega como HTML estático.
import type { Product } from "@spora/api-client";
import { div, h1, main, p, section } from "sibujs";
import { island } from "sibujs/ssr";
import { AddToCart } from "./islands/add-to-cart";
import { Gallery } from "./islands/gallery";
import { VariantSelector } from "./islands/variant-selector";

/**
 * La descripción la escribe el comercio: se muestra como texto (SibuJS escapa), nunca como HTML.
 * ponytail: se pierden negritas y listas; un sanitizador con lista blanca cuando haga falta formato.
 */
const paragraphs = (html: string) =>
  html
    .split(/<\/p>|<br\s*\/?>/i)
    .map((chunk) => chunk.replace(/<[^>]*>/g, "").trim())
    .filter(Boolean);

export function ProductPage(product: Product) {
  const initial = product.variants.find((v) => v.stockLevel !== "OUT_OF_STOCK") ?? product.variants[0];
  const initialVariant = initial
    ? { id: initial.id, featuredAssetId: initial.featuredAssetId, available: initial.stockLevel !== "OUT_OF_STOCK" }
    : null;

  return main("product-page", [
    section({ class: "product-page__media", "aria-label": "Fotos" }, [
      island("gallery", Gallery, {
        productName: product.name,
        assets: product.assets,
        initialAssetId: initial?.featuredAssetId ?? null,
      }),
    ]),
    section("product-page__info", [
      h1("product-page__title", product.name),
      island("variants", VariantSelector, {
        optionGroups: product.optionGroups,
        variants: product.variants,
        initialVariantId: initial?.id ?? "",
      }),
      island("add-to-cart", AddToCart, { variant: initialVariant }),
      div(
        "product-page__description",
        paragraphs(product.descriptionHtml).map((text) => p(text)),
      ),
    ]),
  ]);
}
