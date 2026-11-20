# 0002 — Front: SibuJS con SSR + islas, servido por Hono

- Estado: aceptada (2026-11-13); **Fase 0 superada** (2026-11-19, SibuJS 4.15.2, sibujs-ui 1.10.0). Al día con
  SibuJS 4.15.3 y sibujs-ui 1.10.1 (2026-11-20): bug de SSR resuelto upstream y cliente más liviano (ver abajo).

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

## Resultado de la Fase 0 (2026-11-19)
Ficha de producto en `apps/storefront` leyendo de Vendure local; verificado en Chrome. Esos chequeos son hoy los
primeros recorridos de `pnpm e2e` (`apps/storefront/scripts/e2e.mjs`): ficha sin JS, hidratación sin cambios
visibles y captura idéntica con y sin JS.

| Criterio | Resultado |
|---|---|
| HTML completo sin JS | ✔ Nombre, precio, stock, opciones con la variante inicial marcada, 4 fotos, botón y descripción. |
| Hidratación sin parpadeo | ✔ Las 3 islas se activan sin ningún cambio visible: mismos nodos (identidad), atributos, texto y `checked` al cerrar cada lote de mutaciones; la captura con JS es idéntica píxel a píxel a la de sin JS. |
| Cambiar de estilo sin tocar componentes | ✔ `?estilo=suave` / `?estilo=minimal` devuelven el mismo HTML de la ficha; solo cambia el CSS enlazado (radio 20px → 0, sombra difusa → ninguna, borde 0 → 1px). |

### Cómo quedó armado
- Servidor: `renderToStringAsync()` con el DOM de servidor que trae `sibujs/ssr` (sin jsdom ni happy-dom).
- Islas de componente: `island(nombre, Componente, props)` en el servidor y
  `registerIsland(nombre, islandComponent(Componente))` + `mountIslands()` en el navegador. Es hidratación
  **adopt**: el mismo componente se liga a los nodos del servidor sin reemplazarlos. Lo que no es isla queda como
  HTML inerte.
- Las islas no comparten estado: el selector avisa a la galería y al carrito con un `CustomEvent` en `window`.
- El navegador habla con Vendure solo por `POST /shop-api` del storefront, que pone el token del canal y reenvía
  la cookie de sesión.

### Lo que hay que saber (hallazgos)
- **`checked` reactivo no se serializaba en SSR** (tampoco `selected` ni `value` reactivo), y al hidratar el chip
  cambiaba de color. Se reportó ([reportes/sibujs-checked-ssr.md](../reportes/sibujs-checked-ssr.md)) y **se
  corrigió en SibuJS 4.15.3**. El workaround (`markIf`, que ponía el atributo en `onElement`) se quitó; los
  componentes usan `checked`/`selected` normales y un test de regresión vigila que el bug no vuelva.
- **Props como JSON en `data-sibu-props`**: el HTML lleva una copia de los datos de cada isla (~3 KB con 6
  variantes). Vigilar con productos de muchas variantes.
- **Peso del cliente:** en la Fase 0, 171 KB minificado / 58 KB gzip, porque el tree-shaking de SibuJS rendía poco.
  SibuJS 4.15.3 lo arregló (PR #100): **145 KB / 47 KB gzip** en las tiendas y **34 KB / 12 KB gzip** en el
  marketplace (antes 114 KB). Sigue pesando `tailwind-merge` (27 KB), que arrastra sibujs-ui.
- **sibujs-ui** funciona en SSR + adopt (botón de "agregar al carrito"). Sin compilar Tailwind hay que cargar su CSS
  precompilado (116 KB, incluye Preflight). Colores y `--radius` son variables, puenteadas a `--sp-*` en
  `@spora/themes/base.css`; las **sombras son valores fijos de Tailwind**, así que la forma de las sombras la
  ponemos con nuestras clases. Si se usa mucho sibujs-ui, compilar Tailwind v4 con nuestros tokens.
- **Router de SibuJS:** no hizo falta; Hono rutea en el servidor. `renderRoute` y `createRenderHandler` existen si
  se quiere ruteo compartido con el cliente.
- `Intl.NumberFormat("es-CR")` da el mismo texto en Node 22 y en Chrome (con espacio duro como separador de miles):
  no hubo desajuste al hidratar.
