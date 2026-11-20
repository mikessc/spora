// "Mi tienda": tema, textos, políticas y credenciales de envío de la tienda activa (updateStoreSettings).
import { graphql } from "@/gql";
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
    activeChannel {
      id
      code
      customFields {
        storeName
        designStyle
        primaryColor
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

type Values = Record<string, string>;

const Field = ({ id, label, children }: { id: string; label: string; children: ReactNode }) => (
  <div className="grid gap-1.5">
    <Label htmlFor={id}>{label}</Label>
    {children}
  </div>
);
const selectClass = "h-9 w-full rounded-md border bg-background px-3 text-sm";

export function StoreSettingsPage() {
  const { ctx } = useDashboardUserContext();
  const isStore = !!ctx.activeChannel && ctx.activeChannel.code !== "__default_channel__";
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["spora-store"], queryFn: () => api.query(STORE, {}), enabled: isStore });
  const [values, setValues] = useState<Values>({});
  const [secrets, setSecrets] = useState<Values>({ trackingAppKey: "", trackingAppWebhookSecret: "" });

  useEffect(() => {
    const cf = data?.activeChannel.customFields;
    if (!cf) return;
    const plain = Object.fromEntries(Object.entries(cf).map(([k, v]) => [k, typeof v === "string" ? v : ""]));
    setValues({ ...plain, logoId: cf.logo?.id ?? "" });
  }, [data]);

  const save = useMutation({
    mutationFn: () => {
      const input: Record<string, string | null> = {};
      for (const [name, value] of Object.entries(values)) if (name !== "logo") input[name] = value.trim() || null;
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
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <Page pageId="spora-mi-tienda">
      <PageTitle>Mi tienda</PageTitle>
      <PageLayout>
        <PageBlock column="main" blockId="spora-mi-tienda-form">
          {!isStore ? (
            <p className="text-muted-foreground">Elija una tienda en el selector de canal (arriba a la izquierda).</p>
          ) : !data ? (
            <p className="text-muted-foreground">Cargando…</p>
          ) : (
            <form id="mi-tienda" className="grid gap-6" onSubmit={submit}>
              <section className="grid gap-4 md:grid-cols-2">
                <h2 className="text-lg font-semibold md:col-span-2">Tema</h2>
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
                <Field id="primaryColor" label="Color de marca">
                  <Input
                    id="primaryColor"
                    placeholder="#1d6b4f"
                    value={values.primaryColor ?? ""}
                    onChange={set("primaryColor")}
                  />
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
              </section>
              <section className="grid gap-4 md:grid-cols-2">
                <h2 className="text-lg font-semibold md:col-span-2">Textos y contacto</h2>
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
              </section>
              <section className="grid gap-4 md:grid-cols-2">
                <h2 className="text-lg font-semibold md:col-span-2">Envíos: TrackingApp</h2>
                <p className="text-sm text-muted-foreground md:col-span-2">
                  Se guardan cifradas. Déjelas vacías para no cambiarlas.
                </p>
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
              </section>
              <div>
                <Button type="submit" disabled={save.isPending}>
                  Guardar
                </Button>
              </div>
            </form>
          )}
        </PageBlock>
      </PageLayout>
    </Page>
  );
}
