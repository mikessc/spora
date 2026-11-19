import type { Asset } from "@spora/shared";
import { button, div, img, li, onMount, signal, ul } from "sibujs";
import { onVariant } from "./variant-event";

export interface GalleryProps {
  productName: string;
  assets: Asset[];
  initialAssetId: string | null;
}

export function Gallery({ productName, assets, initialAssetId }: GalleryProps) {
  const [index, setIndex] = signal(
    Math.max(
      0,
      assets.findIndex((a) => a.id === initialAssetId),
    ),
  );
  const current = () => assets[index()];

  const root = div("gallery", [
    div("gallery__main", [
      img({
        class: "gallery__image",
        src: () => current()?.preview ?? "",
        alt: () => `${productName}, foto ${index() + 1} de ${assets.length}`,
        width: 600,
        height: 600,
      }),
    ]),
    ul(
      { class: "gallery__thumbs", "aria-label": "Fotos del producto" },
      assets.map((asset, i) =>
        li([
          button(
            {
              type: "button",
              class: "gallery__thumb",
              "aria-label": `Ver foto ${i + 1}`,
              "aria-current": () => (index() === i ? "true" : null),
              on: { click: () => setIndex(i) },
            },
            [img({ src: `${asset.preview}?preset=thumb`, alt: "", width: 80, height: 80 })],
          ),
        ]),
      ),
    ),
  ]);

  onMount(
    () =>
      onVariant((variant) => {
        const i = assets.findIndex((a) => a.id === variant?.featuredAssetId);
        if (i >= 0) setIndex(i);
      }),
    root,
  );
  return root;
}
