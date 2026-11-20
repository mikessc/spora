# 0007 — Panel Spora sobre el Vendure Dashboard (React)

- Estado: aceptada (2026-11-20)

## Contexto
El MVP usaba el Admin UI clásico de Vendure (Angular, `@vendure/admin-ui-plugin`) como panel del comercio y del
admin de Spora. Vendure dejó de mantenerlo en julio de 2026; su reemplazo es el **Vendure Dashboard**
(`@vendure/dashboard`, React + Vite), que se extiende con `defineDashboardExtension`. Las pantallas que faltaban
(comisiones, tema de la tienda) vivían en páginas sueltas (`/panel/comisiones`, `/panel/tienda`) porque extender el
Admin UI exigía compilar Angular.

## Decisión
Migrar al Vendure Dashboard (guía oficial de migración) y llamarlo **Panel Spora**.
- `DashboardPlugin` sirve el panel en `/dashboard`; `AdminUiPlugin` se quita. Las direcciones `/panel/comisiones` y
  `/panel/tienda` redirigen (301) a sus pantallas nuevas.
- Un plugin propio, `PanelPlugin` (`apps/backend/src/plugins/panel`), registra la extensión con la marca, el menú y
  las pantallas de Spora. No agrega API: usa la de cada plugin (tienda, comisiones, catálogo, envíos).
- **Menú:** "Mi tienda" (tema, textos, políticas y credenciales de envío vía `updateStoreSettings`), "Comisiones" (el
  estado de cuenta, con lo que se facturará al cierre) y, solo para el admin de Spora, la sección "Spora" con
  "Disputas" y "Acuerdos de comisión" (y "Marcas" desde la corrección 2). Al comercio se le ocultan las pantallas de
  Vendure que no puede usar: canales, bodega, configuración global y vendedores (el servidor las rechaza igual).
- **Marca:** nombre "Panel Spora" en el login, la barra lateral y el título de la pestaña; logo provisional (un
  brote) en `panel/dashboard/logo.svg`, que se reemplaza con otro archivo; colores de Spora en `panel/theme.ts`;
  interfaz en español de Costa Rica.

## Cómo quedó armado
- `apps/backend/vite.config.mts` compila el panel con `vendureDashboardPlugin` (`module: "esm"`). Vite corre con tsx
  (`pnpm dev` y `pnpm --filter @spora/backend build`) porque el plugin carga nuestra config de Vendure, que es ESM con
  imports sin extensión y usa `@spora/shared` en TypeScript.
- En desarrollo, `pnpm dev` levanta Vendure y el Vite del panel (5173); `DashboardPlugin` le hace de proxy. Sin Vite,
  sirve `apps/backend/dist/dashboard`.
- `src/gql` (tipos de `gql.tada` generados del esquema) se versiona para que el typecheck del panel ande en un clon
  limpio. El typecheck del panel informa solo errores de nuestros archivos: `@vendure/dashboard` publica su código
  fuente en TypeScript y no compila con nuestra configuración estricta.
- Lo que el Dashboard no deja configurar se resolvió por extensión: el logo de la barra lateral va por CSS
  (`spora.css`), el título "… • Vendure" y el favicon con un provider, el idioma inicial (el Dashboard arranca en
  inglés) con el mismo provider, y los textos del login con un `.po` propio.

## Lo que no se cambió: el aviso "Vendure vX"
El Dashboard muestra un aviso chico "Vendure v3.8.2" en el pie del menú y del login. Su código lo declara **requisito
de licencia** (Vendure es GPLv3 o licencia comercial, VCL) y lo protege contra hojas de estilo que intenten ocultarlo.
Se deja visible: todo lo demás lleva la marca Spora. Para quitarlo, hace falta la licencia comercial de Vendure.

## Consecuencias
- El panel suma React, Vite y Tailwind al backend (solo para compilar el panel; el servidor no los usa).
- Las pantallas nuevas se hacen en React con los componentes del Dashboard, no en SibuJS (el front de las tiendas
  sigue en SibuJS, ADR 0002).
- Al subir Vendure hay que revisar el Dashboard: su API de extensiones es nueva y cambia entre versiones menores.
