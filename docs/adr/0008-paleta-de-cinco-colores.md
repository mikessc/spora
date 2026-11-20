# 0008 — Paleta de 5 colores por tienda

- Estado: aceptada (2026-11-20). Reemplaza la capa "paleta" del ADR 0005 (un solo color de marca).

## Contexto
Con un solo `primaryColor`, todas las tiendas se veían iguales salvo por los botones: el encabezado, el pie, las
franjas y las insignias salían de los grises de Spora. Además, un color de marca claro (amarillo, celeste) hacía
ilegibles los enlaces y los precios.

## Decisión
Cada tienda elige **5 roles** (`@spora/themes`, `palette.ts`):

| Rol | Se usa en |
| --- | --- |
| Primario | botones de compra, enlaces, precio |
| Secundario | encabezado, pie, franjas |
| Acento | ofertas e insignias |
| Fondo | fondo de la tienda |
| Texto | texto general |

- De cada color se **derivan** el hover, un tono suave (para superficies), el **texto legible encima** (el de la
  paleta si alcanza WCAG AA 4.5:1, si no blanco o negro) y un tono que se lee como texto sobre el fondo (los enlaces y
  el precio usan ese, así un primario claro no se vuelve ilegible). `themeCss()` las escribe como variables `--sp-*`;
  los componentes siguen sin colores fijos.
- Los **5 estilos** reparten los roles a su manera: suave (encabezado en el tono suave del secundario, pie en el
  secundario), minimal (el secundario solo en las líneas), vibrante (degradados del primario y del acento), editorial
  (franja en el suave del secundario) y pop (encabezado en el secundario, franja de portada en el acento).
- **Avisos de contraste** (`paletteWarnings`) en palabras del comercio. No bloquean el guardado: el comercio decide.
- **8 paletas sugeridas** por rubro, todas sin avisos (lo verifica un test), y **paleta sugerida desde el logo**: el
  panel lee los colores del logo con un canvas y `paletteFromColors` elige primario y acento.
- **Vista previa en vivo** en "Mi tienda": la tienda real en un iframe con `?paleta=`, `?estilo=` y `?fuente=`, que
  cambian solo esa respuesta (lo inválido se ignora).
- **Migración:** las tiendas existentes reciben una paleta derivada de su `primaryColor` (`paletteFromPrimary`).

## Consecuencias
- El canal guarda 5 campos (`palettePrimary`…`paletteText`); sin paleta completa se usa la de Spora.
- Sugerir desde el logo necesita leer la imagen desde el panel: con los recursos en otro dominio (CDN), ese dominio
  debe permitir CORS.
- La vista previa en iframe obliga a que la tienda se pueda incrustar desde el panel: al agregar protección contra
  clickjacking, permitir el origen del Panel Spora en `frame-ancestors`.
