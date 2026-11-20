// El estado de los formularios llega al HTML del servidor. SibuJS < 4.15.3 no lo serializaba (reporte resuelto en
// docs/reportes/sibujs-checked-ssr.md): sin esto, el HTML sin JS sale sin la opción elegida y el control cambia al
// hidratar. Si alguno de estos tests falla, el bug volvió.
import { div, input, option, select, signal, textarea } from "sibujs";
import { renderToStringAsync } from "sibujs/ssr";
import { describe, expect, test } from "vitest";
import { AddressFields } from "./address";
import { FilterPanel } from "./catalog";

const html = async (build: () => Node) => (await renderToStringAsync(() => div([build()]))).html;

describe("SibuJS serializa el estado de los controles", () => {
  test("radios y casillas: checked fijo o reactivo, y nada si es false", async () => {
    expect(await html(() => input({ type: "radio", checked: true }))).toMatch(/checked/);
    expect(await html(() => input({ type: "radio", checked: () => true }))).toMatch(/checked/);
    expect(await html(() => input({ type: "checkbox", checked: true }))).toMatch(/checked/);
    expect(await html(() => input({ type: "radio", checked: false }))).not.toMatch(/checked/);
    expect(await html(() => input({ type: "radio", checked: () => false }))).not.toMatch(/checked/);
  });

  test("selects: selected fijo o reactivo, y value del select, en una sola opción", async () => {
    const two = (selectedB: boolean | (() => boolean)) =>
      select([option({ value: "a" }, "A"), option({ value: "b", selected: selectedB }, "B")]);
    for (const out of [await html(() => two(true)), await html(() => two(() => true))]) {
      expect(out).toMatch(/<option value="b" selected/);
      expect(out).not.toMatch(/<option value="a" selected/);
    }
    const byValue = await html(() =>
      select({ value: () => "b" }, [option({ value: "a" }, "A"), option({ value: "b" }, "B")]),
    );
    expect(byValue).toMatch(/<option value="b" selected/);
    expect(byValue).not.toMatch(/<option value="a" selected/);
  });

  test("inputs y textarea: value fijo o reactivo", async () => {
    const [text] = signal("hola");
    expect(await html(() => input({ value: "hola" }))).toContain('value="hola"');
    expect(await html(() => input({ value: () => text() }))).toContain('value="hola"');
    expect(await html(() => textarea({ value: () => text() }))).toContain(">hola</textarea>");
  });
});

describe("nuestros componentes dejan la elección en el HTML", () => {
  test("filtros: la casilla elegida sale marcada", async () => {
    const out = await html(() =>
      FilterPanel({
        action: "/",
        groups: [
          {
            name: "color",
            label: "Color",
            values: [
              { value: "rojo", label: "Rojo", count: 2, selected: true },
              { value: "azul", label: "Azul", count: 1, selected: false },
            ],
          },
        ],
      }),
    );
    expect(out).toMatch(/<input[^>]*value="rojo"[^>]*checked/);
    expect(out).not.toMatch(/<input[^>]*value="azul"[^>]*checked/);
  });

  test("dirección: el distrito guardado sale elegido", async () => {
    const out = await html(() => AddressFields({ districtCode: "10201" }));
    expect(out).toMatch(/<option value="10201" selected/);
    expect(out.match(/selected/g)).toHaveLength(1);
  });
});
