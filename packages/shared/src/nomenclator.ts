// Nomenclátor de Costa Rica (provincia › cantón › distrito), copiado del de TrackingApp con sus mismos códigos:
// provincia `1`, cantón `101`, distrito = código postal de 5 dígitos (`10101`; tres distritos que comparten código
// postal llevan sufijo, p. ej. `10104-per`). Regenerar con scripts/nomenclator-desde-trackingapp.mjs.
import rows from "../data/nomenclator-cr.json";

export interface Province {
  code: string;
  name: string;
}
export interface Canton extends Province {
  provinceCode: string;
}
export interface District extends Province {
  cantonCode: string;
  postalCode: string;
}
/** Un distrito con su cantón y provincia, listo para guardar en una dirección. */
export interface DistrictPlace {
  district: District;
  canton: Canton;
  province: Province;
}

type Row = [1, string, string, null] | [2, string, string, string] | [3, string, string, string, string];

const provinces: Province[] = [];
const cantons: Canton[] = [];
const districts: District[] = [];
for (const row of rows as Row[]) {
  if (row[0] === 1) provinces.push({ code: row[1], name: row[2] });
  else if (row[0] === 2) cantons.push({ code: row[1], name: row[2], provinceCode: row[3] });
  else districts.push({ code: row[1], name: row[2], cantonCode: row[3], postalCode: row[4] });
}
const byCode = <T extends { code: string }>(list: T[]) => new Map(list.map((x) => [x.code, x]));
const provinceByCode = byCode(provinces);
const cantonByCode = byCode(cantons);
const districtByCode = byCode(districts);

export const crProvinces = (): Province[] => provinces;
export const crCantons = (provinceCode?: string): Canton[] =>
  provinceCode ? cantons.filter((c) => c.provinceCode === provinceCode) : cantons;
export const crDistricts = (cantonCode?: string): District[] =>
  cantonCode ? districts.filter((d) => d.cantonCode === cantonCode) : districts;

/** Distrito con su cantón y provincia; `null` si el código no existe (vino de un formulario: no se confía). */
export function crPlace(districtCode: string): DistrictPlace | null {
  const district = districtByCode.get(districtCode);
  const canton = district && cantonByCode.get(district.cantonCode);
  const province = canton && provinceByCode.get(canton.provinceCode);
  return district && canton && province ? { district, canton, province } : null;
}
