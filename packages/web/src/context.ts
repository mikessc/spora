// Tipos que comparten el servidor y los módulos de rutas (cuenta, checkout).
import type { ShopClient, Store } from "@spora/api-client";
import type { Context } from "hono";

/** Lo que una página aporta al `<head>`. */
export interface PageMeta {
  title: string;
  description?: string | null;
  /** URL absoluta canónica. */
  canonical: string;
  /** Datos estructurados (schema.org) de la página. */
  jsonLd?: unknown;
  /** Para resultados de búsqueda o páginas sin valor propio. */
  noindex?: boolean;
}

export type Env = { Variables: { slug: string; shop: ShopClient; setCookies: string[] } };
export type Ctx = Context<Env>;

/** Una página carga sus datos y devuelve cómo construirse: el árbol se arma dentro del render SSR (con su DOM). */
export type Page = (
  store: Store,
) => Promise<{ content: () => Node; meta: Omit<PageMeta, "canonical">; status?: number } | Response>;

export type Render = (c: Ctx, page: Page) => Promise<Response>;

/** Campo de texto de un formulario, recortado (nunca `null`). */
export const field = (form: FormData, name: string): string => String(form.get(name) ?? "").trim();
