// Ficha de producto. Solo corre en el servidor: lo que no es isla llega como HTML estático.
import type { Product, Store } from "@spora/api-client";
import { htmlToParagraphs } from "@spora/shared";
import { div, form, h1, input, main, p, section } from "sibujs";
import { island } from "sibujs/ssr";
import { islands } from "./islands";

export function ProductPage(product: Product) {
  const initial = product.variants.find((v) => v.stockLevel !== "OUT_OF_STOCK") ?? product.variants[0];
  const initialVariant = initial
    ? { id: initial.id, featuredAssetId: initial.featuredAssetId, available: initial.stockLevel !== "OUT_OF_STOCK" }
    : null;

  return main("product-page", [
    section({ class: "product-page__media", "aria-label": "Fotos" }, [
      island("gallery", islands.gallery, {
        productName: product.name,
        assets: product.assets,
        initialAssetId: initial?.featuredAssetId ?? null,
      }),
    ]),
    section("product-page__info", [
      h1("product-page__title", product.name),
      // Sin JS se compra igual: los radios de las opciones y el botón envían este formulario.
      form({ class: "product-page__buy", method: "post", action: "/carrito/agregar" }, [
        input({ type: "hidden", name: "producto", value: product.slug }),
        island("variants", islands.variants, {
          optionGroups: product.optionGroups,
          variants: product.variants,
          initialVariantId: initial?.id ?? "",
        }),
        island("add-to-cart", islands["add-to-cart"], { variant: initialVariant }),
      ]),
      // La descripción la escribe el comercio: se muestra como texto (SibuJS escapa), nunca como HTML.
      div(
        "product-page__description",
        htmlToParagraphs(product.descriptionHtml).map((text) => p(text)),
      ),
    ]),
  ]);
}

const AVAILABILITY = {
  IN_STOCK: "https://schema.org/InStock",
  LOW_STOCK: "https://schema.org/LimitedAvailability",
  OUT_OF_STOCK: "https://schema.org/OutOfStock",
} as const;

/** Datos estructurados (schema.org/Product) para buscadores: un `Offer` por variante. */
export function productJsonLd(product: Product, store: Store, url: string, brandName?: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: htmlToParagraphs(product.descriptionHtml).join(" "),
    image: product.assets.map((a) => a.preview),
    url,
    ...(brandName ? { brand: { "@type": "Brand", name: brandName } } : {}),
    offers: product.variants.map((v) => ({
      "@type": "Offer",
      sku: v.sku,
      name: v.name,
      // schema.org pide el precio en unidades mayores, como texto con punto decimal.
      price: (v.price.amount / 100).toFixed(2),
      priceCurrency: v.price.currency,
      availability: AVAILABILITY[v.stockLevel],
      seller: { "@type": "Organization", name: store.name },
    })),
  };
}
