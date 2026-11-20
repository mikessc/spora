// Utilidades de las pantallas del Panel Spora.
import type { ReactNode } from "react";

/** Montos en la unidad menor (céntimos o centavos), como en todo Spora. */
export const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("es-CR", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).format(amount / 100);

/** Día y mes de negocio en hora de Costa Rica. */
export const crDay = (at: Date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(at);
export const crMonth = () => crDay().slice(0, 7);
export const showDay = (iso: string) => new Date(iso).toLocaleDateString("es-CR", { timeZone: "America/Costa_Rica" });

/** El pedido en el Dashboard. */
export const OrderLink = ({ id, code }: { id: string | number; code: string }) => (
  <a className="underline underline-offset-2" href={`/dashboard/orders/${id}`}>
    {code}
  </a>
);

export const STATUS_LABELS: Record<string, string> = {
  pendiente: "Pendiente",
  facturable: "Facturable",
  facturado: "Facturado",
  anulado: "Anulado",
  en_disputa: "En disputa",
};

/** Tabla simple con los estilos del Dashboard. */
export function SimpleTable({ head, rows, empty }: { head: ReactNode[]; rows: ReactNode[][]; empty: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            {head.map((h, i) => (
              <th key={i} className="px-2 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, i) => (
              <tr key={i} className="border-b last:border-0">
                {row.map((cell, j) => (
                  <td key={j} className="px-2 py-2 align-top">
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={head.length} className="px-2 py-3 text-muted-foreground">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Descarga un CSV (con BOM para que Excel lea las tildes). */
export function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const link = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })),
    download: name,
  });
  link.click();
}
