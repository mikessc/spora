import path from "node:path";
import { fileURLToPath } from "node:url";
import { AssetServerPlugin } from "@vendure/asset-server-plugin";
import { AdminUiPlugin } from "@vendure/admin-ui-plugin";
import { DefaultJobQueuePlugin, DefaultSchedulerPlugin, type VendureConfig } from "@vendure/core";
import { AccountPlugin } from "./plugins/account/account.plugin";
import { CatalogPlugin } from "./plugins/catalog/catalog.plugin";
import { CommissionsPlugin } from "./plugins/commissions/commissions.plugin";
import { MarketplacePlugin } from "./plugins/marketplace/marketplace.plugin";
import { CurrencyPlugin } from "./plugins/currency/currency.plugin";
import { PaymentsPlugin } from "./plugins/payments/payments.plugin";
import { ShippingPlugin } from "./plugins/shipping/shipping.plugin";
import { SellersPlugin } from "./plugins/sellers/sellers.plugin";

const dir = path.dirname(fileURLToPath(import.meta.url));
const env = (name: string, devDefault: string): string => {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV === "production") throw new Error(`Falta la variable de entorno ${name}`);
  return devDefault;
};

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
    // Panel del comercio y admin de Spora (MVP.md): el Admin UI de Vendure, con roles por canal.
    AdminUiPlugin.init({ route: "admin", port: Number(env("ADMIN_UI_PORT", "3002")) }),
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
