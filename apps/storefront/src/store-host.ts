/**
 * `tienda-demo.spora.localhost:4000` → `tienda-demo`. Devuelve `null` para el dominio raíz (el marketplace), para
 * otros dominios y para subdominios anidados. Dominio propio por tienda: fuera del MVP.
 */
export function storeSlugFromHost(host: string, baseDomain: string): string | null {
  const hostname = host.toLowerCase().replace(/:\d+$/, "");
  const suffix = `.${baseDomain.toLowerCase()}`;
  if (!hostname.endsWith(suffix)) return null;
  const slug = hostname.slice(0, -suffix.length);
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug) && slug !== "www" ? slug : null;
}
