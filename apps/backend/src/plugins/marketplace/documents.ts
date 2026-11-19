// De catálogo de tienda a documentos del índice global. Puro: se prueba sin Meilisearch.
import type { Store } from "@spora/api-client";
import { type CatalogProduct, convertMoney, type MarketplaceProduct, type MarketplaceStore } from "@spora/shared";

/** slug de categoría → la categoría y sus ancestras, de la raíz hacia abajo (`moda`, `moda-hombre`, …). */
export function categoryPaths(categories: { slug: string; parentSlug: string | null }[]): Map<string, string[]> {
  const parentOf = new Map(categories.map((c) => [c.slug, c.parentSlug]));
  const paths = new Map<string, string[]>();
  for (const { slug } of categories) {
    const path: string[] = [];
    for (let s: string | null | undefined = slug; s && !path.includes(s); s = parentOf.get(s)) path.unshift(s);
    paths.set(slug, path);
  }
  return paths;
}

export function toMarketplaceDocuments(
  store: Store,
  catalog: CatalogProduct[],
  context: { paths: Map<string, string[]>; brandNames: Map<string, string>; rate: string },
): { products: MarketplaceProduct[]; store: MarketplaceStore } {
  const products = catalog
    // PLAN §3.3: sin categoría global no se publica (tampoco en el marketplace).
    .filter((p) => p.category && p.priceFrom)
    .map((p): MarketplaceProduct => {
      const price = p.priceFrom!;
      const attributes = Object.entries(p.attributes).flatMap(([name, values]) =>
        (values ?? []).map((v) => `${name}:${v.value}`),
      );
      const attributeLabels = Object.fromEntries(
        Object.entries(p.attributes).flatMap(([name, values]) =>
          (values ?? []).map((v) => [`${name}:${v.value}`, v.label]),
        ),
      );
      return {
        id: `${store.token}-${p.id}`,
        slug: p.slug,
        name: p.name,
        description: p.description,
        image: p.image,
        storeToken: store.token,
        storeName: store.name,
        // Solo marcas aprobadas: una propuesta todavía no aparece en el marketplace.
        brand: p.brand && context.brandNames.has(p.brand) ? p.brand : null,
        brandName: (p.brand && context.brandNames.get(p.brand)) || null,
        categories: context.paths.get(p.category!) ?? [p.category!],
        attributes,
        attributeLabels,
        price,
        priceCrc: convertMoney(price, "CRC", context.rate).amount,
        currency: price.currency,
        available: p.available,
      };
    });
  return {
    products,
    store: {
      id: store.token,
      name: store.name,
      tagline: store.tagline,
      logo: store.logo,
      currency: store.currency,
      productCount: products.length,
      categories: [...new Set(products.map((p) => p.categories[0]!))],
    },
  };
}
