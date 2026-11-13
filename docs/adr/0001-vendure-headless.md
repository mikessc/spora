# 0001 — Backend: Vendure headless con un canal por tienda

- Estado: aceptada (2026-11-13)

## Contexto
El marketplace central debe mezclar productos, marcas y categorías de todas las tiendas. Cada tienda es de un comercio
independiente. Un solo desarrollador (PHP/JS) con Claude Code.

## Opciones
- **WordPress Multisite + WooCommerce:** barato, pero cada sitio tiene tablas propias; agregar el catálogo central
  exige copiar datos. Rendimiento débil a escala.
- **Drupal Commerce + Domain Access:** una base de datos, agregación natural con Views/Search API. Curva alta y front
  menos moderno.
- **Vendure / Medusa / Saleor (headless):** un backend con varios canales; front libre.
- **SaaS (Shopify):** costo por tienda y techo de personalización.

## Decisión
Vendure: TypeScript de punta a punta, canales nativos (catálogo, precios, stock y métodos por tienda), ejemplo oficial
multi-vendor, pagos y envíos como plugins.

## Consecuencias
- Un solo backend y una sola base de datos: el marketplace lee todo sin sincronizar entre sistemas.
- Hay que escribir plugins propios: comisiones, proveedores de pago y envío locales, marcas curadas.
