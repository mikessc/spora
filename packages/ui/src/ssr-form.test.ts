// Estado de los formularios en el HTML del servidor (bug de SSR de SibuJS: docs/reportes/sibujs-checked-ssr.md).
import { div, input, option, select, signal, textarea } from "sibujs";
import { renderToStringAsync } from "sibujs/ssr";
import { describe, expect, test } from "vitest";
import { markIf } from "./ssr-form";

const html = async (build: () => Node) => (await renderToStringAsync(() => div([build()]))).html;

describe("canario: lo que SibuJS 4.15 no serializa (si alguno falla, upstream lo arregló: revisar el workaround)", () => {
  test("checked, fijo o reactivo", async () => {
    expect(await html(() => input({ type: "radio", checked: true }))).not.toMatch(/checked/);
    expect(await html(() => input({ type: "radio", checked: () => true }))).not.toMatch(/checked/);
  });

  test("value reactivo en input y textarea (el fijo sí sale)", async () => {
    const [text] = signal("hola");
    expect(await html(() => input({ value: "hola" }))).toContain('value="hola"');
    expect(await html(() => input({ value: () => text() }))).not.toContain("hola");
    expect(await html(() => textarea({ value: () => text() }))).not.toContain("hola");
  });

  test("selected en option, fijo o reactivo, y value reactivo en select", async () => {
    const options = () => [option({ value: "a" }, "A"), option({ value: "b", selected: true }, "B")];
    expect(await html(() => select(options()))).not.toMatch(/selected/);
    expect(await html(() => select([option({ value: "b", selected: () => true }, "B")]))).not.toMatch(/selected/);
    expect(
      await html(() => select({ value: () => "b" }, [option({ value: "a" }, "A"), option({ value: "b" }, "B")])),
    ).not.toMatch(/selected/);
  });
});

describe("workaround: markIf deja el estado en el HTML", () => {
  test("checked y selected", async () => {
    expect(await html(() => input({ type: "radio", onElement: markIf(true, "checked") }))).toContain('checked=""');
    expect(await html(() => input({ type: "radio", onElement: markIf(false, "checked") }))).not.toMatch(/checked/);
    const out = await html(() =>
      select([
        option({ value: "a", onElement: markIf(false, "selected") }, "A"),
        option({ value: "b", onElement: markIf(true, "selected") }, "B"),
      ]),
    );
    expect(out).toContain('<option value="b" selected="">');
    expect(out).not.toContain('<option value="a" selected');
  });
});
