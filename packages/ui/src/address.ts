// Campos de una dirección de Costa Rica con el nomenclátor compartido con TrackingApp. Solo servidor.
import { type Address, crCantons, crDistricts, crProvinces } from "@spora/shared";
import { div, input, label, optgroup, option, p, select, textarea } from "sibujs";
import { markIf } from "./ssr-form";

/**
 * Un solo `<select>` de distritos agrupados por "Provincia › Cantón": funciona sin JS y se puede buscar tecleando.
 * (Un selector en cascada provincia → cantón → distrito sería una isla; queda para cuando haga falta.)
 */
function DistrictSelect(selectedCode: string | undefined, required: boolean) {
  return select({ id: "distrito", name: "distrito", required, autocomplete: "off", class: "address__select" }, [
    option({ value: "", onElement: markIf(!selectedCode, "selected") }, "Elija el distrito"),
    ...crProvinces().flatMap((province) =>
      crCantons(province.code).map((canton) =>
        optgroup(
          { label: `${province.name} › ${canton.name}` },
          crDistricts(canton.code).map((district) =>
            option(
              { value: district.code, onElement: markIf(district.code === selectedCode, "selected") },
              district.name,
            ),
          ),
        ),
      ),
    ),
  ]);
}

/**
 * `required: false` cuando hay direcciones guardadas para elegir: si no, el navegador exigiría llenar la nueva aunque
 * se haya elegido una guardada (el servidor valida igual).
 */
export function AddressFields(address: Partial<Address> = {}, required = true) {
  const field = (id: string, text: string, control: Node, hint?: string) =>
    div("address__field", [label({ for: id }, text), control, hint ? p("address__hint", hint) : null]);
  return div("address", [
    field(
      "destinatario",
      "Nombre de quien recibe",
      input({
        id: "destinatario",
        name: "destinatario",
        required,
        autocomplete: "name",
        value: address.fullName ?? "",
      }),
    ),
    field(
      "telefono-envio",
      "Teléfono",
      input({
        id: "telefono-envio",
        name: "telefono-envio",
        type: "tel",
        required,
        autocomplete: "tel",
        value: address.phone ?? "",
      }),
    ),
    field("distrito", "Distrito", DistrictSelect(address.districtCode, required), "Provincia › cantón › distrito"),
    field(
      "senas",
      "Señas",
      textarea({ id: "senas", name: "senas", required, rows: 3, autocomplete: "street-address" }, address.street ?? ""),
      "Calles, puntos de referencia y color de la casa o número de apartamento.",
    ),
  ]);
}
