// Checkout: datos y dirección → envío → pago → confirmación. Formularios POST → redirección: funciona sin JS.
import { ShopApiError } from "@spora/api-client";
import {
  type Address,
  type Cart,
  convertMoney,
  crPlace,
  type Customer,
  type ExchangeRate,
  formatDateTime,
  formatMoney,
  orderStateLabel,
  otherCurrency,
  type PaymentOption,
  type ShippingOption,
} from "@spora/shared";
import { AddressFields, markIf } from "@spora/ui";
import type { Hono } from "hono";
import { a, button, div, fieldset, form, h1, h2, input, label, legend, li, main, ol, p, section, span } from "sibujs";
import { type Ctx, type Env, field, type Render } from "./context";

const STEPS = ["Datos", "Envío", "Pago"] as const;

function Steps(current: number) {
  return ol(
    { class: "checkout__steps", "aria-label": "Pasos del pago" },
    STEPS.map((name, i) =>
      li({ class: "checkout__step", "aria-current": i === current ? "step" : null }, `${i + 1}. ${name}`),
    ),
  );
}

const errorBox = (error?: string) => (error ? p({ class: "form__error", role: "alert" }, error) : null);

/** Resumen del pedido con el total en la otra moneda (tipo de cambio del BCCR del día o el guardado en el pedido). */
function Summary(cart: Cart, rate: string | null) {
  const other = rate ? convertMoney(cart.total, otherCurrency(cart.currency), rate) : null;
  const row = (text: string, value: string, cls = "summary__row") => div(cls, [span(text), span(value)]);
  return section({ class: "summary", "aria-label": "Resumen del pedido" }, [
    ...cart.lines.map((line) => row(`${line.quantity} × ${line.variantName}`, formatMoney(line.linePrice))),
    row("Subtotal", formatMoney(cart.subTotal)),
    row("Envío", cart.shippingMethod ? formatMoney(cart.shipping) : "Por definir"),
    row("Total", formatMoney(cart.total), "summary__row summary__total"),
    other
      ? p("summary__other", `≈ ${formatMoney(other)} al tipo de cambio de ₡${rate} por dólar (BCCR, venta).`)
      : null,
  ]);
}

function ContactPage({ cart, customer, error }: { cart: Cart; customer: Customer | null; error?: string }) {
  const saved = customer?.addresses ?? [];
  return main("checkout", [
    Steps(0),
    h1("checkout__title", "Sus datos"),
    errorBox(error),
    form({ class: "form checkout__form", method: "post", action: "/checkout/datos" }, [
      customer
        ? p("checkout__who", `Comprando como ${customer.firstName} ${customer.lastName} (${customer.email}).`)
        : fieldset("form__group", [
            legend("Contacto"),
            p([
              "¿Tiene Cuenta Spora? ",
              a({ href: "/cuenta/ingresar?volver=/checkout/datos" }, "Ingrese"),
              " y use sus direcciones.",
            ]),
            ...(
              [
                ["nombre", "Nombre", "given-name", "text", cart.customer?.firstName],
                ["apellidos", "Apellidos", "family-name", "text", cart.customer?.lastName],
                ["correo", "Correo", "email", "email", cart.customer?.email],
                ["telefono", "Teléfono", "tel", "tel", ""],
              ] as const
            ).map(([id, text, autocomplete, type, value]) =>
              div("form__field", [
                label({ for: id }, text),
                input({ id, name: id, type, autocomplete, required: true, value: value ?? "" }),
              ]),
            ),
          ]),
      fieldset("form__group", [
        legend("Dirección de entrega"),
        ...(saved.length
          ? [
              ...saved.map((addr, i) =>
                label("checkout__choice", [
                  input({
                    type: "radio",
                    name: "direccion",
                    value: addr.id ?? "",
                    onElement: markIf(i === 0, "checked"),
                  }),
                  span(`${addr.fullName}: ${addr.street}, ${addr.district}, ${addr.canton}`),
                ]),
              ),
              label("checkout__choice", [
                input({ type: "radio", name: "direccion", value: "nueva" }),
                span("Otra dirección"),
              ]),
            ]
          : []),
        AddressFields({ ...(cart.shippingAddress ?? {}) }, saved.length === 0),
        customer
          ? label("checkout__choice", [
              input({ type: "checkbox", name: "guardar", value: "1", onElement: markIf(true, "checked") }),
              span("Guardar esta dirección en mi cuenta"),
            ])
          : null,
      ]),
      button({ class: "form__submit", type: "submit" }, "Continuar"),
    ]),
    Summary(cart, null),
  ]);
}

function ShippingPage({ cart, options, error }: { cart: Cart; options: ShippingOption[]; error?: string }) {
  const current = cart.shippingMethod?.id ?? options[0]?.id;
  return main("checkout", [
    Steps(1),
    h1("checkout__title", "Envío"),
    errorBox(error),
    cart.shippingAddress
      ? p(
          "checkout__who",
          `Entregar a ${cart.shippingAddress.fullName}: ${cart.shippingAddress.street}, ${cart.shippingAddress.district}, ${cart.shippingAddress.canton}, ${cart.shippingAddress.province}.`,
        )
      : null,
    form({ class: "form checkout__form", method: "post", action: "/checkout/envio" }, [
      fieldset("form__group", [
        legend("¿Cómo lo recibe?"),
        ...options.map((o) =>
          label("checkout__choice", [
            input({
              type: "radio",
              name: "envio",
              value: o.id,
              required: true,
              onElement: markIf(o.id === current, "checked"),
            }),
            span("checkout__choice-name", o.name),
            span("checkout__choice-price", o.price.amount ? formatMoney(o.price) : "Gratis"),
            o.description ? span("checkout__choice-note", o.description) : null,
          ]),
        ),
      ]),
      button({ class: "form__submit", type: "submit" }, "Continuar"),
    ]),
    p([a({ href: "/checkout/datos" }, "Cambiar la dirección")]),
    Summary(cart, null),
  ]);
}

function PaymentPage({
  cart,
  options,
  rate,
  error,
}: {
  cart: Cart;
  options: PaymentOption[];
  rate: ExchangeRate;
  error?: string;
}) {
  const eligible = options.filter((o) => o.eligible);
  return main("checkout", [
    Steps(2),
    h1("checkout__title", "Pago"),
    errorBox(error),
    form({ class: "form checkout__form", method: "post", action: "/checkout/pago" }, [
      fieldset("form__group", [
        legend("¿Cómo paga?"),
        ...eligible.map((o, i) =>
          label("checkout__choice", [
            input({
              type: "radio",
              name: "pago",
              value: o.code,
              required: true,
              onElement: markIf(i === 0, "checked"),
            }),
            span("checkout__choice-name", o.name),
            o.description ? span("checkout__choice-note", o.description) : null,
          ]),
        ),
      ]),
      button({ class: "form__submit", type: "submit" }, `Confirmar pedido · ${formatMoney(cart.total)}`),
    ]),
    p([a({ href: "/checkout/envio" }, "Cambiar el envío")]),
    Summary(cart, rate.rate),
  ]);
}

function OrderPage(order: Cart) {
  const addr = order.shippingAddress;
  return main("checkout", [
    h1("checkout__title", "¡Gracias por su compra!"),
    p("checkout__who", [
      "Pedido ",
      span("order__code", order.code),
      ` · ${orderStateLabel(order.state)}`,
      order.placedAt ? ` · ${formatDateTime(order.placedAt)}` : "",
    ]),
    order.customer ? p(`Le escribimos a ${order.customer.email} con los detalles.`) : null,
    addr
      ? section("checkout__block", [
          h2("Entrega"),
          p(`${addr.fullName} · ${addr.phone}`),
          p(`${addr.street}, ${addr.district}, ${addr.canton}, ${addr.province} (${addr.postalCode})`),
          order.shippingMethod ? p(order.shippingMethod.name) : null,
        ])
      : null,
    section("checkout__block", [
      h2("Pago"),
      ...order.payments.map((pay) =>
        p(`${pay.method === "contra-entrega" ? "Contra entrega" : pay.method}: ${formatMoney(pay.amount)}`),
      ),
      order.exchangeRate ? p("order__rate", `Tipo de cambio del pedido: ₡${order.exchangeRate} por dólar.`) : null,
    ]),
    Summary(order, order.exchangeRate),
    p([a({ href: "/" }, "Seguir comprando"), " · ", a({ href: "/cuenta" }, "Mis pedidos")]),
  ]);
}

/** El pedido en curso si se puede seguir con el checkout; si no, la redirección al paso que falta. */
async function activeCart(c: Ctx, needs: "lines" | "address" | "shipping"): Promise<Cart | Response> {
  const cart = await c.get("shop").activeOrder();
  if (!cart?.lines.length) return c.redirect("/carrito", 303);
  if (needs !== "lines" && !cart.shippingAddress) return c.redirect("/checkout/datos", 303);
  if (needs === "shipping" && !cart.shippingMethod) return c.redirect("/checkout/envio", 303);
  return cart;
}

const meta = (title: string) => ({ title, noindex: true });

export function registerCheckoutRoutes(app: Hono<Env>, render: Render) {
  app.get("/checkout", (c) => c.redirect("/checkout/datos", 303));

  const contactPage = (c: Ctx, error?: string) =>
    render(c, async () => {
      const cart = await activeCart(c, "lines");
      if (cart instanceof Response) return cart;
      const customer = await c.get("shop").customer();
      return {
        content: () => ContactPage({ cart, customer, error }),
        meta: meta("Sus datos"),
        status: error ? 400 : 200,
      };
    });

  app.get("/checkout/datos", (c) => contactPage(c));

  app.post("/checkout/datos", async (c) => {
    const form = await c.req.formData();
    const shop = c.get("shop");
    const customer = await shop.customer();
    if (!customer) {
      const guest = {
        firstName: field(form, "nombre"),
        lastName: field(form, "apellidos"),
        email: field(form, "correo"),
        phone: field(form, "telefono"),
      };
      if (Object.values(guest).some((v) => !v)) return contactPage(c, "Complete sus datos de contacto.");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(guest.email)) return contactPage(c, "Revise el correo.");
      try {
        await shop.setGuest(guest);
      } catch (err) {
        const taken = err instanceof ShopApiError && err.code === "EMAIL_ADDRESS_CONFLICT_ERROR";
        return contactPage(
          c,
          taken ? "Ese correo tiene Cuenta Spora: ingrese para continuar." : "No se pudieron guardar sus datos.",
        );
      }
    }

    let address: Address | undefined;
    const chosen = field(form, "direccion");
    if (customer && chosen && chosen !== "nueva") {
      address = customer.addresses.find((addr) => addr.id === chosen);
    } else {
      const place = crPlace(field(form, "distrito"));
      const street = field(form, "senas");
      const fullName = field(form, "destinatario");
      const phone = field(form, "telefono-envio");
      if (place && street && fullName && phone) {
        address = {
          fullName,
          phone,
          street,
          province: place.province.name,
          canton: place.canton.name,
          district: place.district.name,
          districtCode: place.district.code,
          postalCode: place.district.postalCode,
        };
      }
    }
    if (!address) return contactPage(c, "Complete la dirección: quién recibe, teléfono, distrito y señas.");
    await shop.setShippingAddress(address);
    if (customer && form.get("guardar") && (!chosen || chosen === "nueva")) await shop.saveAddress(address);
    return c.redirect("/checkout/envio", 303);
  });

  const shippingPage = (c: Ctx, error?: string) =>
    render(c, async () => {
      const cart = await activeCart(c, "address");
      if (cart instanceof Response) return cart;
      const options = await c.get("shop").shippingOptions();
      return { content: () => ShippingPage({ cart, options, error }), meta: meta("Envío"), status: error ? 400 : 200 };
    });

  app.get("/checkout/envio", (c) => shippingPage(c));

  app.post("/checkout/envio", async (c) => {
    const id = field(await c.req.formData(), "envio");
    const shop = c.get("shop");
    if (!(await shop.shippingOptions()).some((o) => o.id === id))
      return shippingPage(c, "Elija cómo recibir el pedido.");
    await shop.setShippingMethod(id);
    return c.redirect("/checkout/pago", 303);
  });

  const paymentPage = (c: Ctx, error?: string) =>
    render(c, async () => {
      const cart = await activeCart(c, "shipping");
      if (cart instanceof Response) return cart;
      const [options, rate] = await Promise.all([c.get("shop").paymentOptions(), c.get("shop").exchangeRate()]);
      return {
        content: () => PaymentPage({ cart, options, rate, error }),
        meta: meta("Pago"),
        status: error ? 400 : 200,
      };
    });

  app.get("/checkout/pago", (c) => paymentPage(c));

  app.post("/checkout/pago", async (c) => {
    const method = field(await c.req.formData(), "pago");
    const shop = c.get("shop");
    if (!(await shop.paymentOptions()).some((o) => o.code === method && o.eligible)) {
      return paymentPage(c, "Elija cómo pagar.");
    }
    try {
      const order = await shop.pay(method);
      return c.redirect(`/pedido/${order.code}`, 303);
    } catch {
      return paymentPage(c, "No se pudo confirmar el pago. Intente de nuevo.");
    }
  });

  app.get("/pedido/:code", (c) =>
    render(c, async (store) => {
      const order = await c.get("shop").orderByCode(c.req.param("code"));
      if (!order) {
        return {
          content: () => main("checkout", [h1("Pedido no encontrado"), p("Ingrese con su Cuenta Spora para verlo.")]),
          meta: meta("Pedido"),
          status: 404,
        };
      }
      return { content: () => OrderPage(order), meta: meta(`Pedido ${order.code} · ${store.name}`) };
    }),
  );
}
