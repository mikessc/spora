// Marca Spora en el Dashboard: logo del login, título de la pestaña y favicon. El logo es ./logo.svg (ADR 0007).
import { useUserSettings } from "@vendure/dashboard";
import { type ReactNode, useEffect } from "react";
import logoUrl from "./logo.svg?url";

export function LoginLogo() {
  return (
    <div className="flex items-center gap-2">
      <img src={logoUrl} alt="" className="h-10 w-10" />
      <span className="text-2xl font-bold">Panel Spora</span>
    </div>
  );
}

/** El Dashboard titula las pestañas "… • Vendure" sin opción para cambiarlo: aquí pasa a "… • Panel Spora". */
export function SporaBranding({ children }: { children: ReactNode }) {
  // El Dashboard arranca en inglés aunque i18n.defaultLanguage diga otra cosa: la primera vez (sin locale elegido),
  // español de Costa Rica. Si el usuario cambia el idioma después, se respeta.
  const { settings, settingsReady, setDisplayLanguage, setDisplayLocale } = useUserSettings();
  useEffect(() => {
    if (settingsReady && !/^[A-Z]{2}$/.test(settings.displayLocale ?? "")) {
      setDisplayLanguage("es");
      setDisplayLocale("CR");
    }
  }, [settingsReady, settings.displayLocale, setDisplayLanguage, setDisplayLocale]);

  useEffect(() => {
    const icon = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (icon) {
      icon.type = "image/svg+xml";
      icon.href = logoUrl;
    }
    const retitle = () => {
      if (/(^|• )Vendure$/.test(document.title)) document.title = document.title.replace(/Vendure$/, "Panel Spora");
    };
    retitle();
    const observer = new MutationObserver(retitle);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);
  return <>{children}</>;
}
