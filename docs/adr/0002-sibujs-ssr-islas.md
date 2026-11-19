# 0002 — Front: SibuJS con SSR + islas, servido por Hono

- Estado: aceptada (2026-11-13); **Fase 0 superada** (2026-11-19, SibuJS 4.15.2, sibujs-ui 1.10.0)

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
Ficha de producto en `apps/storefront` leyendo de Vendure local; verificado en Chrome con
`pnpm --filter @spora/storefront check` (`apps/storefront/scripts/check-fase0.mjs`).

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
- **`checked` reactivo no se serializa en SSR.** SibuJS lo escribe como propiedad IDL (igual que un navegador) y el
  HTML sale sin la opción marcada; al hidratar el chip cambiaba de color. Un `checked: true` estático tampoco sale
  (solo un string escribe el atributo). Solución en el componente: `onElement` agrega el atributo cuando `isSSR()`.
  Probablemente aplica igual a `value` y `selected`: revisarlo en cada formulario del checkout. Vale la pena
  reportarlo al repo de SibuJS.
- **Props como JSON en `data-sibu-props`**: el HTML lleva una copia de los datos de cada isla (~3 KB con 6
  variantes). Vigilar con productos de muchas variantes.
- **Peso del cliente:** 171 KB minificado / 58 KB gzip. ~120 KB son del núcleo de SibuJS (su `dist` agrupa muchos
  módulos por chunk y el tree-shaking rinde poco) y 27 KB de `tailwind-merge`, que arrastra sibujs-ui. Aceptable
  para la Fase 0; revisar antes de producción (preguntar upstream, o no usar sibujs-ui dentro de las islas).
- **sibujs-ui** funciona en SSR + adopt (botón de "agregar al carrito"). Sin compilar Tailwind hay que cargar su CSS
  precompilado (116 KB, incluye Preflight). Colores y `--radius` son variables, puenteadas a `--sp-*` en
  `@spora/themes/base.css`; las **sombras son valores fijos de Tailwind**, así que la forma de las sombras la
  ponemos con nuestras clases. Si se usa mucho sibujs-ui, compilar Tailwind v4 con nuestros tokens.
- **Router de SibuJS:** no hizo falta; Hono rutea en el servidor. `renderRoute` y `createRenderHandler` existen si
  se quiere ruteo compartido con el cliente.
- `Intl.NumberFormat("es-CR")` da el mismo texto en Node 22 y en Chrome (con espacio duro como separador de miles):
  no hubo desajuste al hidratar.
