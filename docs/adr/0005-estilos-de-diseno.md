# 0005 — Estilos de diseño: estilo × paleta × tipografía

- Estado: aceptada (2026-11-13)

## Decisión
Cada tienda combina tres capas independientes:
1. **Estilo** (forma): `suave` (muy redondeado, sombras difusas), `minimal` (esquinas rectas, líneas finas),
   `vibrante` (gradientes, brillo), `editorial` (serif, fotos grandes), `pop` (bordes gruesos, sombras duras).
2. **Paleta** (color de marca).
3. **Tipografía.**

Cada estilo es un archivo de variables CSS en `@spora/themes`. Los componentes de `@spora/ui` solo consumen
variables. Un estilo nuevo es un archivo más.
