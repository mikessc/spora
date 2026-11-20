// Panel Spora (ADR 0007): marca, menú y pantallas propias sobre el Vendure Dashboard.
import { defineDashboardExtension, type NavMenuConfig, type NavMenuItem } from "@vendure/dashboard";
import { HandshakeIcon, PercentIcon, ScaleIcon, SproutIcon, StoreIcon, TagIcon } from "lucide-react";
import { AgreementsPage } from "./acuerdos";
import { LoginLogo, SporaBranding } from "./branding";
import { CommissionsPage } from "./comisiones";
import { DisputesPage } from "./disputas";
import { BrandsPage } from "./marcas";
import { StoreSettingsPage } from "./mi-tienda";
import { BrandSelect, CategorySelect } from "./selectores";

const DEFAULT_CHANNEL = "__default_channel__";

/**
 * Pantallas de Vendure que el comercio vería pero no puede usar: el canal (lo edita en "Mi tienda"), la bodega y la
 * configuración global. El servidor las rechaza igual; aquí solo se ocultan.
 */
const SPORA_ONLY = new Set(["channels", "stock-locations", "global-settings", "sellers"]);

const onlyForSpora = (item: NavMenuItem): NavMenuItem =>
  SPORA_ONLY.has(item.id) ? { ...item, isVisible: (ctx) => ctx.isSuperAdmin } : item;

function sporaNav(config: NavMenuConfig): NavMenuConfig {
  return {
    sections: [
      ...config.sections.map((section) =>
        "items" in section && section.items ? { ...section, items: section.items.map(onlyForSpora) } : section,
      ),
      {
        id: "mi-tienda",
        title: "Mi tienda",
        url: "/mi-tienda",
        icon: StoreIcon,
        placement: "top",
        order: 150,
        requiresPermission: "UpdateStoreSettings",
        isVisible: (ctx) => ctx.activeChannel?.code !== DEFAULT_CHANNEL,
      },
      {
        id: "comisiones",
        title: "Comisiones",
        url: "/comisiones",
        icon: PercentIcon,
        placement: "top",
        order: 350,
        requiresPermission: "ReadOrder",
      },
      {
        id: "spora",
        title: "Spora",
        icon: SproutIcon,
        placement: "top",
        order: 600,
        defaultOpen: true,
        isVisible: (ctx) => ctx.isSuperAdmin,
        items: [
          { id: "marcas", title: "Marcas", url: "/marcas", icon: TagIcon },
          { id: "disputas", title: "Disputas", url: "/disputas", icon: ScaleIcon },
          { id: "acuerdos", title: "Acuerdos de comisión", url: "/acuerdos", icon: HandshakeIcon },
        ],
      },
    ],
  };
}

export default defineDashboardExtension({
  login: { logo: { component: LoginLogo } },
  customProviders: [{ id: "spora-branding", component: SporaBranding }],
  navSections: sporaNav,
  // Marca y categoría global del producto (custom fields con ui.component, en catalog.plugin.ts).
  customFormComponents: {
    customFields: [
      { id: "spora-marca", component: BrandSelect },
      { id: "spora-categoria-global", component: CategorySelect },
    ],
  },
  routes: [
    { path: "/mi-tienda", loader: () => ({ breadcrumb: "Mi tienda" }), component: () => <StoreSettingsPage /> },
    { path: "/comisiones", loader: () => ({ breadcrumb: "Comisiones" }), component: () => <CommissionsPage /> },
    { path: "/marcas", loader: () => ({ breadcrumb: "Marcas" }), component: () => <BrandsPage /> },
    { path: "/disputas", loader: () => ({ breadcrumb: "Disputas" }), component: () => <DisputesPage /> },
    { path: "/acuerdos", loader: () => ({ breadcrumb: "Acuerdos de comisión" }), component: () => <AgreementsPage /> },
  ],
});
