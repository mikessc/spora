# Reporte para hexplus/sibujs: lo que entra al bundle sin usarse (4.15.3)

Para el mantenedor de SibuJS y sibujs-ui (issue en <https://github.com/hexplus/sibujs> o directo). En inglés, el
idioma del repo. Medido el 2026-11-20 después de pasar a sibujs 4.15.3 / sibujs-ui 1.10.1 (ver
[ADR 0002](../adr/0002-sibujs-ssr-islas.md) y "Antes de producción" en [PROGRESO](../PROGRESO.md)).

Lo que es nuestro y no de SibuJS (el nomenclátor en el JS de las tiendas, api-client) está separado al final; no va en
el issue.

---

**Title:** Bundle size after 4.15.3: what minimal imports still retain, and four small fixes (sibujs + sibujs-ui)

**Versions:** sibujs 4.15.3 (tag `v4.15.3`, c125b9d), sibujs-ui 1.10.1. esbuild 0.25.12, `bundle`, `minify`,
`format: "iife"`, `target: "es2022"`, `define: { __SIBU_DEV__: "false" }`. KB = 1000 bytes; gzip level 9.

### Summary

First: the 4.15.3 fix for the `window.Sibu` namespace worked. Our store bundle went from 58 to 47 KB gzip and the
marketplace one from 114 to 34 KB minified. Thanks.

What is left is smaller and has four concrete causes, each measured below with a patch:

| # | Package | Cause | Measured gain |
| --- | --- | --- | --- |
| 1 | sibujs | `track.ts` duplicate-instance registry references every `track-core` function | `signal` alone: 5.0 → 3.1 KB gz |
| 2 | sibujs | `action.ts` registers the built-in actions at module level; in a shared `dist` chunk that can't be dropped | −1.7 KB min / −0.6 KB gz on any bundle that reaches that chunk |
| 3 | sibujs | `enhance()`'s context object carries `attr`, so the attribute policy (≈ 11 KB min) ships with every island even when no island calls `attr` | islands-only page: 9.9 → 6.0 KB gz (on top of #1) |
| 4 | sibujs-ui | 14 module-level `cva(...)` without `/* @__PURE__ */`, and `toast.success = …` assignments at module level | `Button` only: sibujs-ui 16.3 → 2.6 KB min |

Together, on our two real bundles:

| Bundle | Loaded by | Today (min / gz) | With 1, 2 and 4 | With 3 too |
| --- | --- | --- | --- | --- |
| `cliente.js` | every store page | 145.0 / 47.0 KB | 124.7 / 41.7 KB | — (the store pages need the policy anyway, for the tag factories) |
| `marketplace.js` | every marketplace page | 33.9 / 12.3 KB | 27.5 / 10.3 KB | ≈ 15.5 / 6.0 KB |

How each number was measured is at the end ("Method"). The `cliente.js` figure resolves sibujs from source, so it
also includes the last ~1 KB min by which `dist` is larger than source.

### What we actually import

Every store page loads the same `cliente.js`: three component islands adopted with `islandComponent` (gallery,
variant selector, add to cart) and two `enhance` islands (filter form, cart counter). Every marketplace page loads
`marketplace.js`: one `enhance` island that only calls `ctx.on`.

- **sibujs** (our code): `signal`, `derived`, `onMount`, `registerIsland`, `mountIslands`, and the tags `div`, `button`,
  `img`, `ul`, `li`, `p`, `span`, `fieldset`, `legend`, `label`, `input`. **sibujs/ssr:** `islandComponent`.
- **sibujs-ui:** `Button` only.
- sibujs-ui's own file imports 38 names from sibujs (`effect`, `show`, `createId`, `dispose`, `registerDisposer`,
  `untracked`, table/select/nav tags…). Most of them disappear with fix #4, because the components that use them
  stop being retained.

Today `cliente.js` breaks down like this (bytes in the minified output, esbuild metafile):

| Package | Bytes |
| --- | --- |
| sibujs | 61 500 |
| tailwind-merge (through sibujs-ui `cn()`) | 27 495 |
| @spora/shared (ours, see the end) | 22 032 |
| sibujs-ui | 16 323 |
| @spora/api-client (ours) | 12 943 |
| @spora/ui (ours) | 3 047 |
| class-variance-authority, clsx, app | 1 403 |

### Minimal reproduction

```js
// npm i sibujs@4.15.3 sibujs-ui@1.10.1 esbuild@0.25 && node repro.mjs
import { build } from "esbuild";
import { gzipSync } from "node:zlib";

const cases = {
  "signal": `import { signal } from "sibujs"; globalThis.x = signal(0);`,
  "div": `import { div } from "sibujs"; document.body.append(div("hi"));`,
  "signal + div": `import { signal, div } from "sibujs";
    const [n, setN] = signal(0);
    document.body.append(div({ onclick: () => setN(n() + 1) }, () => String(n())));`,
  "registerIsland + mountIslands": `import { registerIsland, mountIslands } from "sibujs";
    registerIsland("filters", (ctx) => ctx.on(null, "change", () => ctx.root.requestSubmit()));
    mountIslands();`,
  "sibujs-ui Button": `import { Button } from "sibujs-ui"; document.body.append(Button({}, "Buy"));`,
};

for (const [name, contents] of Object.entries(cases)) {
  const r = await build({
    stdin: { contents, resolveDir: process.cwd(), loader: "js" },
    bundle: true, minify: true, format: "iife", write: false, metafile: true, logLevel: "silent",
    define: { __SIBU_DEV__: "false" },
  });
  const code = r.outputFiles[0].contents;
  const kb = (n) => (n / 1000).toFixed(1);
  console.log(`\n${name}: ${kb(code.length)} KB min, ${kb(gzipSync(code, { level: 9 }).length)} KB gzip`);
  const inputs = Object.entries(Object.values(r.metafile.outputs)[0].inputs)
    .filter(([, v]) => v.bytesInOutput > 0)
    .sort((a, b) => b[1].bytesInOutput - a[1].bytesInOutput);
  for (const [file, v] of inputs) console.log(`  ${String(v.bytesInOutput).padStart(6)}  ${file.replace(/.*node_modules[\\/]/, "")}`);
  const leaked = ["clickOutside", "longPress", "trapFocus"].filter((s) => r.outputFiles[0].text.includes(`"${s}"`));
  if (leaked.length) console.log(`  built-in actions in the bundle (never imported): ${leaked.join(", ")}`);
}
```

Output in a clean `npm i`:

| Case | min | gzip |
| --- | --- | --- |
| `signal` | 13.7 KB | 5.1 KB |
| `div` | 35.0 KB | 12.8 KB |
| `signal` + `div` | 36.5 KB | 13.4 KB |
| `registerIsland` + `mountIslands` (one `ctx.on`) | 33.9 KB | 12.3 KB, plus `clickOutside`, `longPress` and `trapFocus` in the bundle |
| sibujs-ui `Button` | 82.7 KB | 27.0 KB |

Which source modules end up in `registerIsland` + `mountIslands`, bundling the same tag from source so the metafile
shows modules instead of chunks:

| Bytes | Module | Needed for `ctx.on`? |
| --- | --- | --- |
| 8 735 | `src/reactivity/track-core.ts` | partly (#1) |
| 4 898 | `src/utils/sanitize.ts` | no (#3) |
| 3 889 | `src/platform/enhance.ts` | yes |
| 2 495 | `src/utils/setSafeAttribute.ts` | no (#3) |
| 2 474 | `src/platform/islands.ts` | yes |
| 1 933 | `src/utils/elementPolicy.ts` | no (#3) |
| 1 718 | `src/core/errors.ts` | yes |
| 1 357 | `src/utils/metaRefresh.ts` | no (#3) |
| 1 288 | `src/reactivity/track.ts` | partly (#1) |
| 902 | `src/core/rendering/dispose.ts` | yes |
| 734 | `src/core/ssr-context.ts` | yes |
| 224 | `dev.ts`, `globalSingleton.ts`, `domBinding.ts` | yes |

From the published `dist` the same case is about 3 KB larger. Most of that difference is #2.

For reference, the chunks in the output above: `chunk-MJHAEFZD` = `track-core` + `track`; `chunk-P7SJCBSQ` =
`tagFactory`, `bindChildNode`, `range`, `focusPreservation`; `chunk-B3HOT4TK` = `sanitize`; `chunk-RVWJGWCL` =
`elementPolicy` + `metaRefresh`; `chunk-ANYE7WB4` = `setSafeAttribute`, `bindAttribute`, `requireDocument`;
`chunk-BF3WBJJQ` = `errors`, `dispose`, `globalSingleton`; `chunk-6EGDKTKF` = the large chunk (32 modules, including
`enhance`, `islands`, `action`, `lifecycle`, `each`, `mount`).

### Causes and proposed changes

`sideEffects: false` is already set, and the `exports` map is fine. The packaging can't remove what is left, for
these reasons.

#### 1. `track.ts`: the registry keeps all of `track-core`

`resolveReactiveApi()` builds one object holding every `track-core` function and stores it on `globalThis`, so one
copy wins when Vite pre-bundling loads the module twice. That object is a use of every function, so nothing in
`track-core` (8.7 KB min) can be dropped. Even `signal` alone ships all of it.

Measured upper bound: re-exporting `track-core` directly takes `signal` alone from 13.3 to 6.8 KB min (5.0 → 2.9 KB
gz) and the islands case from 30.9 to 25.8 KB min.

The registry exists for a real reason, so the proposal is an opt-in for apps that ship a single copy. Each export
checks the define inline:

```ts
declare const __SIBU_SINGLE_INSTANCE__: boolean | undefined;
const API: ReactiveApi =
  typeof __SIBU_SINGLE_INSTANCE__ !== "undefined" && __SIBU_SINGLE_INSTANCE__
    ? ({} as ReactiveApi)
    : resolveReactiveApi();

export const track: ReactiveApi["track"] =
  typeof __SIBU_SINGLE_INSTANCE__ !== "undefined" && __SIBU_SINGLE_INSTANCE__ ? core.track : API.track;
// …same for the other 16 `export const x = API.x`
```

With `define: { __SIBU_SINGLE_INSTANCE__: "true" }`:

| Case | Before | After |
| --- | --- | --- |
| `signal` | 13.3 KB min / 5.0 KB gz | 7.3 KB min / 3.1 KB gz |
| islands, rebuilt `dist` with #2 applied | 32.2 KB min / 11.7 KB gz | 27.5 KB min / 10.3 KB gz |

What we tried, so you don't have to:

- Computing the condition once (`const SINGLE = …`, like `DEV` in `core/dev.ts`) does **not** shake: esbuild doesn't
  propagate that constant into the ternaries, and the bundle grows.
- Returning the `core` namespace as `API` makes esbuild materialize the whole namespace object.
- The inline form costs about +1 KB min when the define is **not** set (17 `typeof` guards). That trips the 28 KB cap
  in `tests/treeshaking-islands.test.ts` (29.6 KB).

A zero-cost alternative is a package `imports` entry with a custom condition (`#reactive-api` resolving to a direct
re-export under a `sibujs-single-instance` condition, and to the registry by default). It needs `#reactive-api` kept
external in the tsup build. Your call; the measurements above are the point.

#### 2. `action.ts`: module-level `registerAction()` calls, stuck in a shared chunk

```ts
registerAction("clickOutside", clickOutside);
registerAction("longPress", longPress);
// …copyOnClick, autoResize, trapFocus
```

From source, esbuild drops `action.ts` whole when nothing imports it, because of `sideEffects: false`. In the
published `dist`, tsup merged it into `chunk-6EGDKTKF.js` together with `enhance`, `islands`, `mount`, `each` and 27
other modules. `sideEffects: false` works per file, so inside that chunk the five calls are ordinary side effects,
and they keep the five actions. Any app that reaches that chunk ships them: `registerIsland`, `mount`, `each`… The
`signal` + `div` + `mount` app in `dist-tree-shaking.test.ts` has them too.

Proposed change: no registration at load time. `getAction()` falls back to the built-ins.

```diff
 export function getAction<T = unknown>(name: string): ActionFn<T> | undefined {
-  return _actions.get(name) as ActionFn<T> | undefined;
+  return (_actions.get(name) ?? builtinAction(name)) as ActionFn<T> | undefined;
 }
@@
-registerAction("clickOutside", clickOutside);
-registerAction("longPress", longPress);
-registerAction("copyOnClick", copyOnClick);
-registerAction("autoResize", autoResize);
-registerAction("trapFocus", trapFocus);
+function builtinAction(name: string): ActionFn<unknown> | undefined {
+  switch (name) {
+    case "clickOutside": return clickOutside as ActionFn<unknown>;
+    case "longPress": return longPress as ActionFn<unknown>;
+    case "copyOnClick": return copyOnClick as ActionFn<unknown>;
+    case "autoResize": return autoResize as ActionFn<unknown>;
+    case "trapFocus": return trapFocus as ActionFn<unknown>;
+  }
+  return undefined;
+}
```

`action(el, "clickOutside")` still works, and `registerAction("clickOutside", custom)` still overrides the built-in.
Rebuilding `dist` with tsup 8.5.1 (the same chunk names as the published package) and bundling against it:

| Case | Before | After | Built-in actions |
| --- | --- | --- | --- |
| `signal` + `div` + `mount` | 40.1 KB min / 14.6 KB gz | 38.4 KB min / 14.0 KB gz | gone |
| islands | 33.9 KB min / 12.3 KB gz | 32.2 KB min / 11.7 KB gz | gone |

`tests/treeshaking-islands.test.ts` and the action tests pass with the change.

This is the general risk of a split `dist`: any module-level statement in a shared chunk becomes a side effect for
everyone who touches the chunk. A cheap guard would be an assertion in `dist-tree-shaking.test.ts` that
`registerIsland` + `mountIslands` does not contain `"clickOutside"`. The structural alternative is publishing
unbundled ESM, one file per module (Rollup `preserveModules`), so `sideEffects: false` applies per module again. From
source, the islands case is still about 1 KB smaller than from the rebuilt `dist` after this change.

#### 3. `enhance()`: `ctx.attr` brings the attribute policy to every island

`enhance` builds one context object with `ref`, `on`, `text`, `attr`, `classed`, `show`, `model`, `each` and
`cleanup`. Methods on an object literal can't be tree-shaken, and `attr` calls `setSafeAttribute`, which pulls in
`sanitize`, `elementPolicy` and `metaRefresh`: about 11 KB min / 3.9 KB gz. Our marketplace island only calls
`ctx.on`.

The policy is clearly deliberate (the comment in `attr` explains why a raw `setAttribute` was a hole), so this is
not a proposal to drop it. Measured cost, replacing that one call with `setAttribute` in a scratch copy, islands case
from source:

| Change | min | gz |
| --- | --- | --- |
| none | 30.9 KB | 11.3 KB |
| without the policy in `attr` | 20.1 KB | 7.4 KB |
| without the policy, plus #1 | 15.5 KB | 6.0 KB |

Possible directions:

- Make the context's heavier helpers standalone, tree-shakable functions (`attr(ctx, "@link", "href", () => …)`),
  keeping `ctx.attr` in a fuller variant.
- A "lite" `enhance` entry without `attr` and `model`.

It only matters for pages that ship islands but no tag factories (`tagFactory` needs the policy anyway). For a
progressive-enhancement framework, that is the main case.

#### 4. sibujs-ui: module-level `cva()` and `toast.*` assignments

sibujs-ui ships one `dist/index.js`. Importing only `Button` retains 16.3 KB of it, for two reasons:

- **14 `var xVariants = cva(…)` at module level** (`alertVariants`, `badgeVariants`, `buttonGroupVariants`,
  `fieldVariants`, `itemVariants`, `sidebarMenuButtonVariants`, `tabsListVariants`, `toggleVariants`…). A call is
  kept unless it is marked pure. Fix in the sources: `export const buttonVariants = /* @__PURE__ */ cva(…)`.
  tsup/esbuild keep the annotation.
- **`toast.success = …`, `toast.error = …`, … `toast.dismiss = …`** right after `function toast()`. Assigning a
  property at module level is a side effect, so the whole toast system stays: renderer, icons, `createToastElement`.
  Fix: `export const toast = /* @__PURE__ */ Object.assign(baseToast, { success, error, warning, info, loading,
  promise, dismiss })`.

Measured by patching `dist/index.js` (adding the annotation, and turning the `toast.*` assignments into unused
declarations, which is equivalent to the pure `Object.assign`):

| Case | sibujs-ui bytes | Bundle min / gz |
| --- | --- | --- |
| `Button` only, today | 16 329 | 81.4 KB / 26.7 KB |
| `cva` pure | 8 136 | 73.2 KB / 25.1 KB |
| `cva` pure + `toast` | 2 594 | 67.6 KB / 23.4 KB |
| our `cliente.js`, today | 16 323 | 145.0 KB / 47.0 KB |
| our `cliente.js`, `cva` pure + `toast` | 2 593 | 131.3 KB / 43.7 KB |

Making the toast store (`var [toasts, setToasts] = signal([])`) lazy adds nothing measurable; it can stay.

Related, but a design choice rather than a bug: `cn()` brings **tailwind-merge**, 27.4 KB min / 8.5 KB gz. That is 18%
of our store JS (gzip), for one `Button`. An optional `cn` without `twMerge` (clsx only, when the app doesn't override
classes) would remove it. That's for you to weigh.

### Method

All the numbers above can be reproduced with esbuild's metafile (`bytesInOutput` per input file):

- **dist:** bundling the published package (the reproduction above).
- **source modules:** bundling the cloned `v4.15.3` tag with `sibujs` resolved to `index.ts`, so each module shows up
  separately.
- **fix #2 and #1 on `dist`:** rebuilding `dist` with `tsup … --format esm --no-config
  --define.__SIBU_VERSION__='"4.15.3"'`. The chunk names are identical to the published package, and our
  `marketplace.js` comes out byte for byte the same.
- **fixes #1 and #4 on our full bundle:** source resolution plus the patched sibujs-ui file, built with
  `__SIBU_SINGLE_INSTANCE__`.

The full vitest suite with #1 and #2 applied shows the same failures as without them, all from tests that need a
built `dist` in place (`consumption`, `docs-artifacts`, `entrypoint-*`, `certify-declared-exports`). The one
exception is the `treeshaking-islands` cap described in #1, which only the #1 prototype trips.

---

## Lo nuestro (no va en el issue)

En `cliente.js`, 35 KB minificados son nuestros y no de SibuJS:

- **El nomenclátor de Costa Rica (20,8 KB min) se va al navegador sin que ninguna isla lo use.**
  - **Por qué:** `@spora/shared` lo reexporta desde `index.ts`, y `nomenclator.ts` llena sus listas y mapas al cargar
    el módulo. Encima, `packages/shared/package.json` no declara `sideEffects`.
  - **Arreglo:** separar ese módulo (o declarar `sideEffects: false` y armar los mapas en el primer uso).
- **`@spora/api-client` (12,9 KB min) entra casi entero** por `createShopClient` en la isla del carrito. Habría que revisar
  si basta con la mutación `addItemToOrder`.
- **Todas las páginas de la tienda cargan las 5 islas.** La portada solo necesita el contador del carrito; separar
  `cliente.js` por página es otra opción.
