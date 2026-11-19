import path from "node:path";
import { fileURLToPath } from "node:url";
import { AssetServerPlugin } from "@vendure/asset-server-plugin";
import { DefaultJobQueuePlugin, type VendureConfig } from "@vendure/core";

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
    superadminCredentials: {
      identifier: env("SUPERADMIN_USER", "superadmin"),
      password: env("SUPERADMIN_PASSWORD", "superadmin"),
    },
    cookieOptions: { secret: env("COOKIE_SECRET", "solo-desarrollo") },
  },
  dbConnectionOptions: {
    type: "postgres",
    host: env("DB_HOST", "localhost"),
    port: Number(env("DB_PORT", "5433")),
    username: env("DB_USER", "spora"),
    password: env("DB_PASSWORD", "spora"),
    database: env("DB_NAME", "spora"),
    // ponytail: synchronize solo para la Fase 0; migraciones desde la Fase 1.
    synchronize: true,
  },
  paymentOptions: { paymentMethodHandlers: [] },
  importExportOptions: { importAssetsDir: path.join(dir, "../seed/assets") },
  plugins: [
    AssetServerPlugin.init({
      route: "assets",
      assetUploadDir: path.join(dir, "../static/assets"),
      assetUrlPrefix: env("ASSET_URL_PREFIX", "http://localhost:3000/assets/"),
    }),
    DefaultJobQueuePlugin.init({}),
  ],
};
