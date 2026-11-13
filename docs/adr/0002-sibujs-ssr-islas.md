# 0002 — Front: SibuJS con SSR + islas, servido por Hono

- Estado: aceptada a prueba (Fase 0) (2026-11-13)

## Contexto
Se evaluó Next.js. Mike prefiere SibuJS (MIT, v4.x): reactividad fina por señales, sin Virtual DOM ni compilador, con
`sibujs/ssr` (`renderToString`, `hydrate`), islas, router y `sibujs/data`. Existe sibujs-ui (56 componentes Tailwind).

## Decisión
SibuJS con SSR + islas sobre un servidor Hono (el mismo que usa TrackingApp). Las páginas llegan como HTML; solo
carrito, filtros, buscador, selector de variantes y checkout se hidratan.

## Riesgos y mitigación
- **No es un meta-framework:** ruteo por dominio, caché, imágenes y SEO los armamos nosotros.
- **Ecosistema chico y un solo mantenedor;** Claude Code lo conoce poco → la documentación de SibuJS va en el repo y
  se lee antes de escribir front.
- **Salida:** `@spora/api-client`, `@spora/shared` y `@spora/themes` no dependen de SibuJS. Si la Fase 0 falla, se
  cambia solo la capa visual (Astro o Next.js).
