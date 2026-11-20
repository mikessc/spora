// "Mi tienda": paleta de 5 colores (con vista previa en vivo y avisos de contraste), tema, textos, políticas y
// credenciales de envío de la tienda activa (updateStoreSettings).
import { graphql } from "@/gql";
import {
  defaultPalette,
  type Palette,
  paletteFromColors,
  paletteLabels,
  paletteRoles,
  paletteWarnings,
  suggestedPalettes,
} from "@spora/themes";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  Button,
  Input,
  Label,
  Page,
  PageBlock,
  PageLayout,
  PageTitle,
  Textarea,
  toast,
  useDashboardUserContext,
} from "@vendure/dashboard";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";

const STORE = graphql(`
  query SporaStoreSettings {
    storeUrl
    activeChannel {
      id
      code
      customFields {
        storeName
        designStyle
        palettePrimary
        paletteSecondary
        paletteAccent
        paletteBackground
        paletteText
        font
        logo {
          id
        }
        tagline
        about
        contactEmail
        contactPhone
        shippingPolicy
        returnsPolicy
        privacyPolicy
      }
    }
    assets(options: { take: 100 }) {
      items {
        id
        name
        preview
      }
    }
  }
`);

const SAVE = graphql(`
  mutation SporaUpdateStoreSettings($input: StoreSettingsInput!) {
    updateStoreSettings(input: $input) {
      id
    }
  }
`);

const STYLES = ["suave", "minimal", "vibrante", "editorial", "pop"];
const FONTS = ["sistema", "clasica", "redondeada", "geometrica", "mono"];
const TEXTS = [
  ["storeName", "Nombre de la tienda"],
  ["tagline", "Frase de la tienda"],
  ["contactEmail", "Correo de contacto"],
  ["contactPhone", "Teléfono o WhatsApp"],
] as const;
const LONG_TEXTS = [
  ["about", "Sobre la tienda"],
  ["shippingPolicy", "Política de envíos"],
  ["returnsPolicy", "Política de cambios y devoluciones"],
  ["privacyPolicy", "Política de privacidad"],
] as const;
/** Campo del canal de cada rol: primary → palettePrimary. */
const field = (role: string) => `palette${role[0]!.toUpperCase()}${role.slice(1)}`;
const HEX = /^#[0-9a-fA-F]{6}$/;

type Values = Record<string, string>;

const Field = ({ id, label, children }: { id: string; label: string; children: ReactNode }) => (
  <div className="grid gap-1.5">
    <Label htmlFor={id}>{label}</Label>
    {children}
  </div>
);
const selectClass = "h-9 w-full rounded-md border bg-background px-3 text-sm";

const Swatches = ({ palette }: { palette: Palette }) => (
  <span className="flex overflow-hidden rounded border">
    {paletteRoles.map((role) => (
      <span key={role} className="h-6 w-6" style={{ background: palette[role] }} />
    ))}
  </span>
);

/**
 * Colores de una imagen, del más al menos presente: se reduce a 48×48, se agrupan los píxeles parecidos y se promedia
 * cada grupo. Necesita la imagen en el mismo origen (o con CORS): los recursos de Vendure lo están.
 */
async function imageColors(url: string): Promise<string[]> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await img.decode();
  const size = 48;
  const canvas = Object.assign(document.createElement("canvas"), { width: size, height: size });
  const g = canvas.getContext("2d")!;
  g.drawImage(img, 0, 0, size, size);
  const data = g.getImageData(0, 0, size, size).data;
  const groups = new Map<string, [number, number, number, number]>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! < 128) continue;
    const [r, gr, b] = [data[i]!, data[i + 1]!, data[i + 2]!];
    const key = [r, gr, b].map((v) => v >> 5).join();
    const sum = groups.get(key) ?? [0, 0, 0, 0];
    groups.set(key, [sum[0] + r, sum[1] + gr, sum[2] + b, sum[3] + 1]);
  }
  return [...groups.values()]
    .sort((a, b) => b[3] - a[3])
    .map(
      ([r, gr, b, n]) =>
        `#${[r, gr, b]
          .map((v) =>
            Math.round(v / n)
              .toString(16)
              .padStart(2, "0"),
          )
          .join("")}`,
    );
}

/** La tienda de verdad, con la paleta, el estilo y la fuente sin guardar (?paleta=, ?estilo=, ?fuente=). */
function Preview({
  storeUrl,
  palette,
  style,
  font,
}: {
  storeUrl: string;
  palette: Palette;
  style: string;
  font: string;
}) {
  const target = `${storeUrl}/?estilo=${style}&fuente=${font}&paleta=${paletteRoles
    .map((role) => palette[role].slice(1))
    .join("-")}`;
  const [src, setSrc] = useState(target);
  useEffect(() => {
    const timer = setTimeout(() => setSrc(target), 400);
    return () => clearTimeout(timer);
  }, [target]);
  return (
    <iframe
      id="vista-previa"
      title="Vista previa de la tienda"
      src={src}
      className="h-[38rem] w-full rounded-md border bg-white"
    />
  );
}

export function StoreSettingsPage() {
  const { ctx } = useDashboardUserContext();
  const isStore = !!ctx.activeChannel && ctx.activeChannel.code !== "__default_channel__";
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["spora-store"], queryFn: () => api.query(STORE, {}), enabled: isStore });
  const [values, setValues] = useState<Values>({});
  const [palette, setPalette] = useState<Palette>(defaultPalette);
  const [secrets, setSecrets] = useState<Values>({ trackingAppKey: "", trackingAppWebhookSecret: "" });

  useEffect(() => {
    const cf = data?.activeChannel.customFields as Record<string, unknown> | undefined;
    if (!cf) return;
    const plain = Object.fromEntries(Object.entries(cf).map(([k, v]) => [k, typeof v === "string" ? v : ""]));
    setValues({ ...plain, logoId: (cf.logo as { id: string } | null)?.id ?? "" });
    const saved = Object.fromEntries(paletteRoles.map((role) => [role, plain[field(role)]]));
    setPalette(paletteRoles.every((role) => HEX.test(saved[role] ?? "")) ? (saved as Palette) : defaultPalette);
  }, [data]);

  const save = useMutation({
    mutationFn: () => {
      const input: Record<string, string | null> = {};
      for (const [name, value] of Object.entries(values)) {
        if (name !== "logo" && !name.startsWith("palette")) input[name] = value.trim() || null;
      }
      for (const role of paletteRoles) input[field(role)] = palette[role];
      for (const [name, value] of Object.entries(secrets)) if (value) input[name] = value;
      return api.mutate(SAVE, { input });
    },
    onSuccess: () => {
      setSecrets({ trackingAppKey: "", trackingAppWebhookSecret: "" });
      void queryClient.invalidateQueries({ queryKey: ["spora-store"] });
      toast.success("Guardado. Los cambios ya se ven en la tienda.");
    },
    onError: (err) => toast.error("No se pudo guardar", { description: err.message }),
  });

  const set = (name: string) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [name]: e.target.value }));
  const setColor = (role: string, value: string) => setPalette((p) => ({ ...p, [role]: value.toLowerCase() }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (paletteRoles.some((role) => !HEX.test(palette[role]))) {
      toast.error("Revise la paleta: cada color va en hexadecimal, como #1d6b4f");
      return;
    }
    save.mutate();
  };
  const fromLogo = async () => {
    const logo = data?.assets.items.find((a) => a.id === values.logoId);
    if (!logo) return;
    try {
      const suggestion = paletteFromColors(await imageColors(logo.preview));
      if (!suggestion) throw new Error("sin colores");
      setPalette(suggestion);
      toast.success("Paleta sugerida a partir del logo. Revise la vista previa antes de guardar.");
    } catch {
      toast.error("No se pudo sugerir una paleta: el logo no tiene colores claros (o no se pudo leer).");
    }
  };
  const valid = paletteRoles.every((role) => HEX.test(palette[role]));
  const warnings = valid ? paletteWarnings(palette) : [];

  return (
    <Page pageId="spora-mi-tienda">
      <PageTitle>Mi tienda</PageTitle>
      {!isStore ? (
        <PageLayout>
          <PageBlock column="main" blockId="spora-mi-tienda-form">
            <p className="text-muted-foreground">Elija una tienda en el selector de canal (arriba a la izquierda).</p>
          </PageBlock>
        </PageLayout>
      ) : !data ? (
        <PageLayout>
          <PageBlock column="main" blockId="spora-mi-tienda-form">
            <p className="text-muted-foreground">Cargando…</p>
          </PageBlock>
        </PageLayout>
      ) : (
        <form id="mi-tienda" onSubmit={submit}>
          <PageLayout>
            <PageBlock column="main" blockId="spora-mi-tienda-paleta" title="Colores de la tienda">
              <div className="grid gap-5">
                <div id="paleta" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {paletteRoles.map((role) => (
                    <div key={role} className="grid gap-1.5">
                      <Label htmlFor={`color-${role}`}>{paletteLabels[role].name}</Label>
                      <span className="-mt-1 text-xs text-muted-foreground">{paletteLabels[role].use}</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          aria-label={`${paletteLabels[role].name}: elegir color`}
                          className="h-9 w-12 cursor-pointer rounded border"
                          value={HEX.test(palette[role]) ? palette[role] : "#000000"}
                          onChange={(e) => setColor(role, e.target.value)}
                        />
                        <Input
                          id={`color-${role}`}
                          value={palette[role]}
                          onChange={(e) => setColor(role, e.target.value)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div id="avisos-contraste" role="status">
                  {!valid ? (
                    <p className="text-sm text-destructive">Cada color va en hexadecimal, como #1d6b4f.</p>
                  ) : warnings.length ? (
                    <ul className="grid gap-1 rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
                      {warnings.map((w) => (
                        <li key={w}>⚠ {w}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">✓ Todas las combinaciones se leen bien (WCAG AA).</p>
                  )}
                </div>
                <div className="grid gap-2">
                  <p className="text-sm font-medium">Paletas sugeridas</p>
                  <div className="flex flex-wrap gap-2">
                    {suggestedPalettes.map((s) => (
                      <Button
                        key={s.name}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setPalette(s.palette)}
                      >
                        <Swatches palette={s.palette} />
                        {s.name}
                        <span className="text-muted-foreground">· {s.category}</span>
                      </Button>
                    ))}
                  </div>
                  <div>
                    <Button type="button" variant="outline" size="sm" disabled={!values.logoId} onClick={fromLogo}>
                      Sugerir a partir del logo
                    </Button>
                    {!values.logoId && (
                      <span className="ml-2 text-xs text-muted-foreground">Elija un logo más abajo.</span>
                    )}
                  </div>
                </div>
                {data.storeUrl && valid && (
                  <Preview
                    storeUrl={data.storeUrl}
                    palette={palette}
                    style={values.designStyle || "suave"}
                    font={values.font || "sistema"}
                  />
                )}
              </div>
            </PageBlock>

            <PageBlock column="main" blockId="spora-mi-tienda-tema" title="Estilo y logo">
              <div className="grid gap-4 md:grid-cols-3">
                <Field id="designStyle" label="Estilo de diseño">
                  <select
                    id="designStyle"
                    className={selectClass}
                    value={values.designStyle ?? ""}
                    onChange={set("designStyle")}
                  >
                    {STYLES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
                <Field id="font" label="Tipografía">
                  <select id="font" className={selectClass} value={values.font ?? ""} onChange={set("font")}>
                    {FONTS.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                </Field>
                <Field id="logoId" label="Logo">
                  <select id="logoId" className={selectClass} value={values.logoId ?? ""} onChange={set("logoId")}>
                    <option value="">Sin logo</option>
                    {data.assets.items.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </PageBlock>

            <PageBlock column="main" blockId="spora-mi-tienda-textos" title="Textos y contacto">
              <div className="grid gap-4 md:grid-cols-2">
                {TEXTS.map(([name, label]) => (
                  <Field key={name} id={name} label={label}>
                    <Input id={name} value={values[name] ?? ""} onChange={set(name)} />
                  </Field>
                ))}
                {LONG_TEXTS.map(([name, label]) => (
                  <Field key={name} id={name} label={label}>
                    <Textarea id={name} rows={3} value={values[name] ?? ""} onChange={set(name)} />
                  </Field>
                ))}
              </div>
            </PageBlock>

            <PageBlock column="main" blockId="spora-mi-tienda-envios" title="Envíos: TrackingApp">
              <p className="mb-3 text-sm text-muted-foreground">
                Se guardan cifradas. Déjelas vacías para no cambiarlas.
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                {(
                  [
                    ["trackingAppKey", "Llave de cliente"],
                    ["trackingAppWebhookSecret", "Secreto del webhook"],
                  ] as const
                ).map(([name, label]) => (
                  <Field key={name} id={name} label={label}>
                    <Input
                      id={name}
                      type="password"
                      autoComplete="off"
                      value={secrets[name]}
                      onChange={(e) => setSecrets((s) => ({ ...s, [name]: e.target.value }))}
                    />
                  </Field>
                ))}
              </div>
              <div className="mt-4">
                <Button type="submit" disabled={save.isPending}>
                  Guardar
                </Button>
              </div>
            </PageBlock>
          </PageLayout>
        </form>
      )}
    </Page>
  );
}
