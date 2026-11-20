import path from "node:path";
import { fileURLToPath } from "node:url";
import { AssetServerPlugin } from "@vendure/asset-server-plugin";
import { DashboardPlugin } from "@vendure/dashboard/plugin";
import { DefaultJobQueuePlugin, DefaultSchedulerPlugin, type VendureConfig } from "@vendure/core";
import { AccountPlugin } from "./plugins/account/account.plugin";
import { CatalogPlugin } from "./plugins/catalog/catalog.plugin";
import { CommissionsPlugin } from "./plugins/commissions/commissions.plugin";
import { MarketplacePlugin } from "./plugins/marketplace/marketplace.plugin";
import { PanelPlugin } from "./plugins/panel/panel.plugin";
import { CurrencyPlugin } from "./plugins/currency/currency.plugin";
import { PaymentsPlugin } from "./plugins/payments/payments.plugin";
import { ShippingPlugin } from "./plugins/shipping/shipping.plugin";
import { SellersPlugin } from "./plugins/sellers/sellers.plugin";

const dir = path.dirname(fileURLToPath(import.meta.url));
const env = (name: string, devDefault: string): string => {
  const value = process.env[name];
  if (value) return value;
  // La compilación del Panel Spora (vite build, con NODE_ENV=production) solo lee la config para sacar el esquema.
  if (process.env.NODE_ENV === "production" && !process.env.SPORA_DASHBOARD_BUILD) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }
  return devDefault;
};
// Telemetría anónima de Vendure apagada también sin .env (un clon recién hecho no tiene .env).
process.env.VENDURE_DISABLE_TELEMETRY ??= "true";

export const config: VendureConfig = {
  apiOptions: {
    port: Number(env("PORT", "3000")),
    adminApiPath: "admin-api",
    shopApiPath: "shop-api",
    // El navegador habla con Vendure solo a través del proxy del storefront.
    cors: false,
    csrfPrevention: true,
  },
  authOptions: {
    tokenMethod: ["bearer", "cookie"],
    // MVP sin correos reales (MVP.md): la cuenta queda activa al registrarse.
    requireVerification: false,
    superadminCredentials: {
      identifier: env("SUPERADMIN_USER", "superadmin"),
      password: env("SUPERADMIN_PASSWORD", "superadmin"),
    },
    // Nombres distintos para que la sesión del Admin UI y la del cliente no se pisen.
    cookieOptions: {
      secret: env("COOKIE_SECRET", "solo-desarrollo"),
      name: { shop: "spora-sesion", admin: "spora-admin" },
    },
  },
  dbConnectionOptions: {
    type: "postgres",
    host: env("DB_HOST", "localhost"),
    port: Number(env("DB_PORT", "5433")),
    username: env("DB_USER", "spora"),
    password: env("DB_PASSWORD", "spora"),
    database: env("DB_NAME", "spora"),
    synchronize: false,
    migrations: [path.join(dir, "migrations/*.{ts,js}")],
  },
  // Los proveedores de pago los registra PaymentsPlugin.
  paymentOptions: { paymentMethodHandlers: [] },
  importExportOptions: { importAssetsDir: path.join(dir, "../seed/assets") },
  plugins: [
    AssetServerPlugin.init({
      route: "assets",
      assetUploadDir: path.join(dir, "../static/assets"),
      assetUrlPrefix: env("ASSET_URL_PREFIX", "http://localhost:3000/assets/"),
    }),
    DefaultJobQueuePlugin.init({}),
    DefaultSchedulerPlugin.init(),
    // Panel Spora (ADR 0007): el Vendure Dashboard con roles por canal. Compilado en dist/dashboard; en desarrollo,
    // DashboardPlugin le hace de proxy al Vite de `pnpm dev` (puerto 5173).
    DashboardPlugin.init({ route: "dashboard", appDir: path.join(dir, "../dist/dashboard") }),
    PanelPlugin,
    SellersPlugin,
    CatalogPlugin,
    CurrencyPlugin,
    AccountPlugin,
    PaymentsPlugin,
    ShippingPlugin,
    CommissionsPlugin,
    MarketplacePlugin,
  ],
};
