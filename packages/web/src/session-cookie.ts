/**
 * Cuenta Spora: la sesión de Vendure se comparte entre todas las tiendas (`*.spora.localhost`) y el marketplace. Vendure
 * pone la cookie sin dominio; el storefront le agrega `Domain` al reenviarla. Así no toca la cookie del Admin UI, que
 * vive en otro host.
 */
export function shareSessionCookie(setCookie: string, baseDomain: string): string {
  const isSession = /^spora-sesion(\.sig)?=/.test(setCookie);
  return isSession && !/;\s*domain=/i.test(setCookie) ? `${setCookie}; Domain=${baseDomain}` : setCookie;
}

/** `/cuenta?x=1` sí; `//evil.com`, `https://…` o `javascript:` no (redirecciones abiertas). */
export const safeReturnPath = (path: string | null | undefined, fallback = "/"): string =>
  path && /^\/(?![/\\])[^\s]*$/.test(path) ? path : fallback;
