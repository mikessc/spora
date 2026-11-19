// Pasarelas con redirección (PayPal, Tilopay): adaptador real + simulado (MVP.md). El simulado es el de por defecto;
// el real se activa con SPORA_PAGOS_REALES=paypal,tilopay y usa las credenciales que el comercio guardó (cifradas).
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { type CurrencyCode, formatMoney } from "@spora/shared";

export interface GatewayCharge {
  orderCode: string;
  /** Lo que se cobra, en la unidad menor de `currency`. */
  amount: number;
  currency: CurrencyCode;
  /** A dónde vuelve el cliente (la tienda); la pasarela le agrega sus parámetros. */
  returnUrl: string;
  customer: { email: string; firstName: string; lastName: string; phone: string };
  address: { street: string; city: string; province: string; postalCode: string } | null;
}

export interface Gateway {
  create(charge: GatewayCharge, args: Record<string, string>): Promise<{ url: string; reference: string }>;
  /** Confirma con la pasarela (no basta con los parámetros del retorno, que vienen del navegador). */
  verify(
    reference: string,
    params: Record<string, string>,
    args: Record<string, string>,
    charge: Pick<GatewayCharge, "amount" | "currency" | "orderCode">,
  ): Promise<{ approved: boolean; reference: string }>;
}

export const realGateways = () => new Set((process.env.SPORA_PAGOS_REALES ?? "").split(",").map((s) => s.trim()));
const decimal = (amount: number) => (amount / 100).toFixed(2);

// ── Simulado ─────────────────────────────────────────────────────────────────────────────────────────────────────

const signingKey = () => `pagos-simulados:${process.env.SPORA_ENCRYPTION_KEY ?? "solo-desarrollo"}`;
export const sign = (data: string) => createHmac("sha256", signingKey()).update(data).digest("hex");
export const validSignature = (data: string, signature: string | undefined) => {
  const expected = Buffer.from(sign(data));
  const got = Buffer.from(signature ?? "");
  return got.length === expected.length && timingSafeEqual(got, expected);
};

/** Página de "pasarela" servida por el backend (`/pagos-simulados`): aprueba o rechaza con un enlace firmado. */
export class SimulatedGateway implements Gateway {
  constructor(private provider: "paypal" | "tilopay") {}

  async create(charge: GatewayCharge) {
    const reference = `sim-${randomUUID()}`;
    const base = process.env.BACKEND_PUBLIC_URL ?? "http://localhost:3000";
    const params = new URLSearchParams({
      proveedor: this.provider,
      pedido: charge.orderCode,
      monto: formatMoney({ amount: charge.amount, currency: charge.currency }),
      ref: reference,
      volver: charge.returnUrl,
      firma: sign(`${reference}|${charge.returnUrl}`),
    });
    return { url: `${base}/pagos-simulados?${params}`, reference };
  }

  async verify(reference: string, params: Record<string, string>) {
    const estado = params.estado ?? "";
    const genuine = params.ref === reference && validSignature(`${reference}|${estado}`, params.firma);
    return { approved: genuine && estado === "aprobado", reference };
  }
}

// ── PayPal (Orders v2) ───────────────────────────────────────────────────────────────────────────────────────────

export class PayPalGateway implements Gateway {
  private base = (args: Record<string, string>) =>
    args.entorno === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

  private async token(args: Record<string, string>) {
    if (!args.clientId || !args.clientSecret) throw new Error("PayPal: faltan las credenciales del comercio");
    const res = await fetch(`${this.base(args)}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${args.clientId}:${args.clientSecret}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`PayPal: autenticación falló (${res.status})`);
    return ((await res.json()) as { access_token: string }).access_token;
  }

  async create(charge: GatewayCharge, args: Record<string, string>) {
    if (charge.currency !== "USD") throw new Error("PayPal cobra en USD");
    const res = await fetch(`${this.base(args)}/v2/checkout/orders`, {
      method: "POST",
      headers: { authorization: `Bearer ${await this.token(args)}`, "content-type": "application/json" },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: charge.orderCode,
            custom_id: charge.orderCode,
            amount: { currency_code: "USD", value: decimal(charge.amount) },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              return_url: charge.returnUrl,
              cancel_url: `${charge.returnUrl}&cancelado=1`,
              user_action: "PAY_NOW",
              shipping_preference: "NO_SHIPPING",
            },
          },
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json()) as { id?: string; links?: { rel: string; href: string }[] };
    const url = body.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
    if (!res.ok || !body.id || !url) throw new Error(`PayPal: no se pudo crear la orden (${res.status})`);
    return { url, reference: body.id };
  }

  async verify(
    reference: string,
    params: Record<string, string>,
    args: Record<string, string>,
    charge: Pick<GatewayCharge, "amount">,
  ) {
    if (params.cancelado || params.token !== reference) return { approved: false, reference };
    const res = await fetch(`${this.base(args)}/v2/checkout/orders/${encodeURIComponent(reference)}/capture`, {
      method: "POST",
      headers: { authorization: `Bearer ${await this.token(args)}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json()) as {
      status?: string;
      purchase_units?: { payments?: { captures?: { amount: { value: string; currency_code: string } }[] } }[];
    };
    const captured = body.purchase_units?.[0]?.payments?.captures?.[0]?.amount;
    const approved =
      body.status === "COMPLETED" && captured?.currency_code === "USD" && captured.value === decimal(charge.amount);
    return { approved, reference };
  }
}

// ── Tilopay (página de pago alojada) ─────────────────────────────────────────────────────────────────────────────
// Docs: https://tilopay.com/developers. Un solo host para pruebas y producción (el modo lo fija la cuenta). El retorno
// trae `code=1` si se aprobó, pero se confirma con `consult` (el algoritmo de OrderHash no es público).

const TILOPAY = "https://app.tilopay.com/api/v1";
const CR_STATES: Record<string, string> = {
  "San José": "CR-SJ",
  Alajuela: "CR-A",
  Cartago: "CR-C",
  Heredia: "CR-H",
  Guanacaste: "CR-G",
  Puntarenas: "CR-P",
  Limón: "CR-L",
};

export class TilopayGateway implements Gateway {
  private async token(args: Record<string, string>) {
    if (!args.apiUser || !args.password || !args.key) throw new Error("Tilopay: faltan las credenciales del comercio");
    const res = await fetch(`${TILOPAY}/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiuser: args.apiUser, password: args.password }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json()) as { access_token?: string };
    if (!body.access_token) throw new Error(`Tilopay: autenticación falló (${res.status})`);
    // ponytail: un login por pago; el token dura 24 h y se puede cachear por comercio si hay volumen.
    return body.access_token;
  }

  async create(charge: GatewayCharge, args: Record<string, string>) {
    // Un intento = un orderNumber: si el cliente reintenta tras un rechazo, Tilopay no lo ve como duplicado.
    const reference = `${charge.orderCode}-${Date.now().toString(36)}`;
    const a = charge.address;
    const res = await fetch(`${TILOPAY}/processPayment`, {
      method: "POST",
      headers: { authorization: `bearer ${await this.token(args)}`, "content-type": "application/json" },
      body: JSON.stringify({
        redirect: charge.returnUrl,
        key: args.key,
        amount: decimal(charge.amount),
        currency: charge.currency,
        orderNumber: reference,
        capture: "1",
        platform: "spora",
        subscription: "0",
        billToFirstName: charge.customer.firstName,
        billToLastName: charge.customer.lastName,
        billToAddress: a?.street ?? "",
        billToAddress2: "",
        billToCity: a?.city ?? "",
        billToState: CR_STATES[a?.province ?? ""] ?? "CR-SJ",
        billToZipPostCode: a?.postalCode ?? "",
        billToCountry: "CR",
        billToTelephone: charge.customer.phone,
        billToEmail: charge.customer.email,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json()) as { type?: string; url?: string; message?: string };
    if (body.type !== "100" || !body.url) throw new Error(`Tilopay: ${body.message ?? "no se pudo crear el pago"}`);
    return { url: body.url, reference };
  }

  async verify(
    reference: string,
    _params: Record<string, string>,
    args: Record<string, string>,
    charge: Pick<GatewayCharge, "amount" | "currency">,
  ) {
    const res = await fetch(`${TILOPAY}/consult`, {
      method: "POST",
      headers: { authorization: `bearer ${await this.token(args)}`, "content-type": "application/json" },
      body: JSON.stringify({ key: args.key, orderNumber: reference }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json()) as {
      response?: { code: string; amount: string; currency: string; environment: string }[];
    };
    const environment = process.env.TILOPAY_ENTORNO; // "Test" o "Production": se exige si está definido.
    const approved = (body.response ?? []).some(
      (t) =>
        t.code === "1" &&
        t.currency === charge.currency &&
        Number(t.amount).toFixed(2) === decimal(charge.amount) &&
        (!environment || t.environment === environment),
    );
    return { approved, reference };
  }
}

export function gatewayFor(provider: "paypal" | "tilopay"): Gateway {
  if (!realGateways().has(provider)) return new SimulatedGateway(provider);
  return provider === "paypal" ? new PayPalGateway() : new TilopayGateway();
}
