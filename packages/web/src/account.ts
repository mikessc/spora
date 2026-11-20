// Cuenta Spora: una sola cuenta para el marketplace y todas las tiendas (la sesión se comparte entre subdominios).
import { ShopApiError } from "@spora/api-client";
import {
  type Address,
  type Customer,
  formatDateTime,
  formatMoney,
  orderStateLabel,
  type OrderSummary,
} from "@spora/shared";
import type { Hono } from "hono";
import {
  a,
  button,
  div,
  form,
  h1,
  h2,
  input,
  label,
  li,
  main,
  p,
  section,
  table,
  tbody,
  td,
  th,
  thead,
  tr,
  ul,
} from "sibujs";
import { type Env, field, type Render } from "./context";
import { safeReturnPath } from "./session-cookie";

const errorBox = (error?: string) => (error ? p({ class: "form__error", role: "alert" }, error) : null);

const textField = (
  id: string,
  text: string,
  props: { type?: string; autocomplete: string; value?: string; minlength?: string; required?: boolean },
) =>
  div("form__field", [
    label({ for: id }, text),
    input({ id, name: id, ...props, type: props.type ?? "text", required: props.required ?? true } as Parameters<
      typeof input
    >[0] &
      object),
  ]);

function LoginPage({ error, email, back }: { error?: string; email?: string; back: string }) {
  return main("account", [
    h1("account__title", "Ingresar"),
    p("account__intro", "Una sola Cuenta Spora para comprar en todas las tiendas."),
    errorBox(error),
    form({ class: "form", method: "post", action: "/cuenta/ingresar" }, [
      input({ type: "hidden", name: "volver", value: back }),
      textField("correo", "Correo", { type: "email", autocomplete: "email", value: email ?? "" }),
      textField("clave", "Clave", { type: "password", autocomplete: "current-password" }),
      button({ class: "form__submit", type: "submit" }, "Ingresar"),
    ]),
    p("account__alt", [
      "¿No tiene cuenta? ",
      a({ href: `/cuenta/registro?volver=${encodeURIComponent(back)}` }, "Crear Cuenta Spora"),
    ]),
  ]);
}

function RegisterPage({ error, values, back }: { error?: string; values: Record<string, string>; back: string }) {
  return main("account", [
    h1("account__title", "Crear Cuenta Spora"),
    p("account__intro", "Con su cuenta compra en cualquier tienda de Spora y ve todos sus pedidos en un solo lugar."),
    errorBox(error),
    form({ class: "form", method: "post", action: "/cuenta/registro" }, [
      input({ type: "hidden", name: "volver", value: back }),
      textField("nombre", "Nombre", { autocomplete: "given-name", value: values.nombre }),
      textField("apellidos", "Apellidos", { autocomplete: "family-name", value: values.apellidos }),
      textField("correo", "Correo", { type: "email", autocomplete: "email", value: values.correo }),
      textField("telefono", "Teléfono", { type: "tel", autocomplete: "tel", value: values.telefono }),
      textField("clave", "Clave (mínimo 8 caracteres)", {
        type: "password",
        autocomplete: "new-password",
        minlength: "8",
      }),
      button({ class: "form__submit", type: "submit" }, "Crear cuenta"),
    ]),
    p("account__alt", [
      "¿Ya tiene cuenta? ",
      a({ href: `/cuenta/ingresar?volver=${encodeURIComponent(back)}` }, "Ingresar"),
    ]),
  ]);
}

/** "¿Recibiste tu pedido?" con dos formularios (funciona sin JS); o el aviso si dijo que no lo recibió. */
function deliveryRow(o: OrderSummary) {
  // Mientras Spora no resuelva la disputa (después el estado dice Entregado o Cancelado).
  if (o.deliveryReport === "no-recibido" && o.state !== "Delivered" && o.state !== "Cancelled") {
    return tr("account__delivery", [
      td({ colspan: "6" }, `Nos dijo que no recibió el pedido ${o.code}: Spora lo está revisando con la tienda.`),
    ]);
  }
  if (!o.canConfirmDelivery) return null;
  const answer = (value: "si" | "no", text: string, cls: string) =>
    form({ class: "account__delivery-form", method: "post", action: "/cuenta/pedido/entrega" }, [
      input({ type: "hidden", name: "pedido", value: o.code }),
      input({ type: "hidden", name: "recibido", value }),
      button({ class: cls, type: "submit" }, text),
    ]);
  return tr("account__delivery", [
    td({ colspan: "6" }, [
      p("account__delivery-question", `¿Recibiste tu pedido ${o.code}?`),
      div("account__delivery-actions", [
        answer("si", "Sí, lo recibí", "form__submit"),
        answer("no", "No lo recibí", "form__secondary"),
      ]),
    ]),
  ]);
}

const DELIVERY_NOTICES: Record<string, string> = {
  recibido: "¡Gracias! Marcamos su pedido como entregado.",
  disputa: "Gracias por avisar. Spora va a revisar el pedido con la tienda.",
  error: "No se pudo registrar su respuesta. Intente de nuevo.",
};

const addressText = (a: Address) => `${a.street}, ${a.district}, ${a.canton}, ${a.province} (${a.postalCode})`;

function AccountPage(customer: Customer, orders: OrderSummary[], storeUrl: (token: string) => string, notice?: string) {
  return main("account", [
    h1("account__title", `Hola, ${customer.firstName}`),
    p("account__intro", `${customer.firstName} ${customer.lastName} · ${customer.email}`),
    notice ? p({ class: "account__notice", role: "status" }, notice) : null,
    section("account__section", [
      h2("Mis pedidos en todas las tiendas"),
      orders.length
        ? table("account__orders", [
            thead([
              tr([
                th({ scope: "col" }, "Pedido"),
                th({ scope: "col" }, "Tienda"),
                th({ scope: "col" }, "Fecha"),
                th({ scope: "col" }, "Estado"),
                th({ scope: "col" }, "Envío"),
                th({ scope: "col" }, "Total"),
              ]),
            ]),
            tbody(
              orders.flatMap((o) => [
                tr([
                  td([a({ href: `${storeUrl(o.storeToken)}/pedido/${o.code}` }, o.code)]),
                  td([a({ href: storeUrl(o.storeToken) }, o.storeName)]),
                  td(o.placedAt ? formatDateTime(o.placedAt) : ""),
                  td(orderStateLabel(o.state)),
                  td(
                    "account__shipment",
                    o.shipment
                      ? [
                          o.shipment.trackingUrl
                            ? a({ href: o.shipment.trackingUrl, rel: "noopener" }, o.shipment.trackingCode)
                            : o.shipment.trackingCode,
                          o.shipment.status ? ` · ${o.shipment.status}` : "",
                        ]
                      : "—",
                  ),
                  td(formatMoney(o.total)),
                ]),
                deliveryRow(o),
              ]),
            ),
          ])
        : p("Todavía no tiene pedidos."),
    ]),
    section("account__section", [
      h2("Direcciones"),
      customer.addresses.length
        ? ul(
            "account__addresses",
            customer.addresses.map((addr) => li(`${addr.fullName}: ${addressText(addr)}`)),
          )
        : p("Se guardan cuando compra."),
    ]),
    form({ method: "post", action: "/cuenta/salir" }, [button({ class: "form__secondary", type: "submit" }, "Salir")]),
  ]);
}

const LOGIN_ERRORS: Record<string, string> = {
  INVALID_CREDENTIALS_ERROR: "El correo o la clave no coinciden.",
  NOT_VERIFIED_ERROR: "Falta verificar la cuenta.",
};

/** URL de una tienda (`token` = subdominio), según desde dónde se pide (la tienda misma o el marketplace). */
export type StoreUrl = (token: string, requestUrl: URL) => string;

export function registerAccountRoutes(app: Hono<Env>, render: Render, storeUrlFor: StoreUrl) {
  const back = (value: string | null | undefined) => safeReturnPath(value, "/cuenta");

  app.get("/cuenta/ingresar", (c) =>
    render(c, async (store) => ({
      content: () => LoginPage({ back: back(c.req.query("volver")) }),
      meta: { title: `Ingresar · ${store.name}`, noindex: true },
    })),
  );

  app.post("/cuenta/ingresar", async (c) => {
    const form = await c.req.formData();
    const email = field(form, "correo");
    const returnTo = back(field(form, "volver"));
    try {
      await c.get("shop").login(email, field(form, "clave"));
      return c.redirect(returnTo, 303);
    } catch (err) {
      const code = err instanceof ShopApiError ? (err.code ?? "") : "";
      const error = LOGIN_ERRORS[code] ?? "No se pudo ingresar. Intente de nuevo.";
      return render(c, async (store) => ({
        content: () => LoginPage({ error, email, back: returnTo }),
        meta: { title: `Ingresar · ${store.name}`, noindex: true },
        status: 400,
      }));
    }
  });

  app.get("/cuenta/registro", (c) =>
    render(c, async (store) => ({
      content: () => RegisterPage({ values: {}, back: back(c.req.query("volver")) }),
      meta: { title: `Crear cuenta · ${store.name}`, noindex: true },
    })),
  );

  app.post("/cuenta/registro", async (c) => {
    const form = await c.req.formData();
    const values = Object.fromEntries(["nombre", "apellidos", "correo", "telefono"].map((k) => [k, field(form, k)]));
    const password = String(form.get("clave") ?? "");
    const returnTo = back(field(form, "volver"));
    const shop = c.get("shop");
    let error = "";
    if (Object.values(values).some((v) => !v)) error = "Complete todos los campos.";
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.correo ?? "")) error = "Revise el correo.";
    else if (password.length < 8) error = "La clave debe tener al menos 8 caracteres.";
    if (!error) {
      try {
        await shop.register({
          firstName: values.nombre!,
          lastName: values.apellidos!,
          email: values.correo!,
          phone: values.telefono!,
          password,
        });
        await shop.login(values.correo!, password);
        return c.redirect(returnTo, 303);
      } catch (err) {
        error =
          err instanceof ShopApiError && err.code === "EMAIL_ADDRESS_CONFLICT_ERROR"
            ? "Ese correo ya tiene Cuenta Spora: ingrese con su clave."
            : "No se pudo crear la cuenta. Intente de nuevo.";
      }
    }
    return render(c, async (store) => ({
      content: () => RegisterPage({ error, values, back: returnTo }),
      meta: { title: `Crear cuenta · ${store.name}`, noindex: true },
      status: 400,
    }));
  });

  app.get("/cuenta", (c) =>
    render(c, async (store) => {
      const shop = c.get("shop");
      const customer = await shop.customer();
      if (!customer) return c.redirect("/cuenta/ingresar?volver=/cuenta", 303);
      const orders = await shop.orders();
      const url = new URL(c.req.url);
      const storeUrl = (token: string) => storeUrlFor(token, url);
      return {
        content: () => AccountPage(customer, orders, storeUrl, DELIVERY_NOTICES[c.req.query("entrega") ?? ""]),
        meta: { title: `Mi cuenta · ${store.name}`, noindex: true },
      };
    }),
  );

  // Respuesta a "¿Recibiste tu pedido?". El backend revisa que el pedido sea de quien responde.
  app.post("/cuenta/pedido/entrega", async (c) => {
    const form = await c.req.formData();
    const received = field(form, "recibido") === "si";
    try {
      await c.get("shop").reportDelivery(field(form, "pedido"), received);
      return c.redirect(`/cuenta?entrega=${received ? "recibido" : "disputa"}`, 303);
    } catch {
      return c.redirect("/cuenta?entrega=error", 303);
    }
  });

  app.post("/cuenta/salir", async (c) => {
    await c.get("shop").logout();
    return c.redirect("/", 303);
  });
}
