/**
 * SibuJS 4.15 no serializa en el SSR el estado de los controles: `checked` y `selected` (aunque sean `true` fijos) ni
 * `value` reactivo (ver docs/reportes/sibujs-checked-ssr.md). Sin esto, el HTML llega sin la opción elegida y el
 * control cambia al hidratar. Uso: `input({ type: "radio", onElement: markIf(elegido, "checked") })`.
 * El atributo es el valor *por defecto* del control: en el navegador no pisa lo que el usuario cambie.
 */
export const markIf =
  (on: boolean, attribute: "checked" | "selected") =>
  (el: Element): void => {
    if (on) el.setAttribute(attribute, "");
  };
