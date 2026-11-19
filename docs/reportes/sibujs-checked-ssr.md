# Reporte para hexplus/sibujs: el SSR pierde el estado de los controles de formulario

Para abrir como issue en <https://github.com/hexplus/sibujs> (o pasárselo directo al mantenedor). Encontrado en la
Fase 0 de Spora (ver [ADR 0002](../adr/0002-sibujs-ssr-islas.md)). En inglés, el idioma del repo.

---

**Title:** SSR drops form control state: `checked`, `selected` and reactive `value` are missing from the server HTML

**Version:** sibujs 4.15.2 (also checked against `main` at 26c59e0), Node 22.14, built-in server DOM
(`renderToStringAsync`)

### Summary

When a page is rendered on the server, the current state of form controls doesn't make it into the HTML:
`checked` is lost even when written as a static `true`, `selected` too, and `value` when it is reactive. The page
arrives with no radio, checkbox or option selected; once JS loads, the client sets the state and the control
visibly changes. With `islandComponent` (adopt hydration) that undoes the main benefit of adopting: the island
looks different before and after hydration.

### Minimal reproduction

```ts
// repro.ts — run with: npx tsx repro.ts
import { div, input, option, select, signal, textarea } from "sibujs";
import { renderToStringAsync } from "sibujs/ssr";

const [on] = signal(true);
const [txt] = signal("hello");

const { html } = await renderToStringAsync(() =>
  div([
    input({ type: "radio", checked: true }),
    input({ type: "radio", checked: () => on() }),
    input({ value: () => txt() }),
    textarea({ value: () => txt() }),
    select([option({ value: "a" }, "A"), option({ value: "b", selected: true }, "B")]),
    select({ value: () => "b" }, [option({ value: "a" }, "A"), option({ value: "b" }, "B")]),
  ]),
);
console.log(html);
```

| Input | Server HTML | Expected |
| --- | --- | --- |
| `checked: true` | `<input type="radio" />` | `<input type="radio" checked="" />` |
| `checked: () => true` | `<input type="radio" />` | `<input type="radio" checked="" />` |
| `checked: ""` | `<input type="radio" checked="" />` ✔ | (works, but the TS types reject a string) |
| `value: "hello"` | `<input value="hello" />` ✔ | — |
| `value: () => txt()` | `<input />` | `<input value="hello" />` |
| `textarea` reactive `value` | `<textarea></textarea>` | `<textarea>hello</textarea>` |
| `option` `selected: true` / `() => true` | no `selected` | `<option value="b" selected="">` |
| `select` `value: () => "b"` | no option selected | `<option value="b" selected="">` |

### Cause

`setSafeAttribute` writes `checked`, `selected` and `disabled` to the IDL property (`BOOLEAN_IDL_ATTRS`,
`src/utils/setSafeAttribute.ts:42`, boolean branch around line 270), and string `value` / `checked` too when
`syncValueProperty` is on (line 284), which is the reactive path. In a browser that is right: the content attribute
is only the default, and a live update must go through the property. The server DOM follows the same rules (as
jsdom does), but the serializer only emits content attributes, so on the server the state lives where it never
reaches the HTML. `disabled` is fine because it reflects.

### Impact

- **Progressive enhancement:** with JS off, forms show nothing selected (a variant picker without the chosen size
  and color, a checkout without the saved shipping option, filters that look cleared).
- **Hydration flash:** with `island(...)` + `islandComponent(...)`, the first client write sets `el.checked = true`
  and the control changes appearance. Caught by snapshotting each claimed element's attributes, text and
  `.checked` at the end of every mutation batch, and by comparing screenshots taken before and after hydration.

### Current workaround

```ts
input({
  type: "radio",
  checked: () => isSelected(),
  onElement: (el) => {
    if (isSSR() && isSelected()) el.setAttribute("checked", "");
  },
});
```

It works with adopt hydration (the claimed input already has the right state, so the first client write changes
nothing), but it has to be repeated on every control, and for `<select>` the `selected` attribute has to go on the
matching `<option>` by hand.

### Possible fixes

1. **During SSR, also reflect the state to the content attribute.** When `isSSR()`, `setSafeAttribute` writes
   `checked` / `selected` as `""` / removed (and `value` for input and textarea) in addition to the property.
   Nobody interacts on the server, so the "stale default" concern behind the IDL path doesn't apply.
2. **Or make the serializer read the state.** When serializing `input`, `textarea`, `select` and `option`, emit the
   current IDL state (`.checked`, `.value`, `.selected`) instead of the default.

Option 1 seems the smaller change; option 2 also covers state set imperatively (`el.checked = true`) during the
render. Either way, a static `checked: true` should probably serialize as an attribute on the server, since it
reads as the initial state.
