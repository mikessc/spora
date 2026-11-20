// "Comisiones": estado de cuenta del mes. El comercio ve su tienda; el admin de Spora, todas, y cierra el mes.
import { graphql } from "@/gql";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  Badge,
  Button,
  Input,
  Label,
  Page,
  PageBlock,
  PageLayout,
  PageTitle,
  toast,
  useDashboardUserContext,
} from "@vendure/dashboard";
import { useState } from "react";
import { crMonth, downloadCsv, money, OrderLink, showDay, SimpleTable, STATUS_LABELS } from "./common";

export const STATEMENT = graphql(`
  query SporaCommissionStatement($month: String!, $sellerId: ID) {
    commissionStatement(month: $month, sellerId: $sellerId) {
      totals {
        currency
        pendiente
        facturable
        facturado
        anulado
        en_disputa
      }
      entries {
        id
        orderId
        orderCode
        storeName
        status
        currency
        baseAmount
        baseIncludesTax
        percentage
        amount
        placedAt
        billingMonth
        closedWithoutDelivery
        autoBillableFrom
      }
    }
  }
`);

export const SELLERS = graphql(`
  query SporaSellers {
    sellers(options: { take: 200 }) {
      items {
        id
        name
      }
    }
  }
`);

const INVOICES = graphql(`
  query SporaCommissionInvoices($sellerId: ID) {
    commissionInvoices(sellerId: $sellerId) {
      id
      month
      sellerId
      currency
      total
      entryCount
    }
  }
`);

const CLOSE = graphql(`
  mutation SporaCloseMonth($month: String!) {
    closeCommissionMonth(month: $month) {
      id
    }
  }
`);

type Entry = {
  orderId: string;
  orderCode: string;
  storeName: string;
  status: string;
  currency: string;
  baseAmount: number;
  baseIncludesTax: boolean;
  percentage: string;
  amount: number;
  placedAt: string;
  billingMonth?: string | null;
  closedWithoutDelivery: boolean;
  autoBillableFrom?: string | null;
};

const TOTALS = ["pendiente", "facturable", "facturado", "anulado", "en_disputa"] as const;

/** PDF: una ventana solo con el estado de cuenta, lista para "Guardar como PDF". */
function printStatement(title: string, entries: Entry[]) {
  const win = window.open("", "_blank");
  if (!win) return;
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  win.document.write(`<!doctype html><html lang="es-CR"><head><meta charset="utf-8"><title>${esc(title)}</title>
    <style>body{font-family:system-ui,sans-serif;margin:2rem}table{border-collapse:collapse;width:100%}
    th,td{border-bottom:1px solid #ddd;padding:.4rem;text-align:left;font-size:.85rem}td.n{text-align:right}</style>
    </head><body><h1>${esc(title)}</h1><p>Base: subtotal de productos sin IVA ni envío.</p><table><tr><th>Pedido</th>
    <th>Tienda</th><th>Fecha</th><th>Estado</th><th>Base sin IVA</th><th>%</th><th>Comisión</th></tr>${entries
      .map(
        (e) => `<tr><td>${esc(e.orderCode)}</td><td>${esc(e.storeName)}</td><td>${showDay(e.placedAt)}</td>
        <td>${STATUS_LABELS[e.status] ?? e.status}${e.closedWithoutDelivery ? " · facturado al cierre sin confirmar entrega" : ""}</td>
        <td class="n">${money(e.baseAmount, e.currency)}${e.baseIncludesTax ? " *" : ""}</td><td class="n">${esc(e.percentage)} %</td>
        <td class="n">${money(e.amount, e.currency)}</td></tr>`,
      )
      .join("")}</table>${
      entries.some((e) => e.baseIncludesTax) ? "<p>* Anterior al cambio: base con IVA.</p>" : ""
    }</body></html>`);
  win.document.close();
  win.print();
}

export function CommissionsPage() {
  const { ctx } = useDashboardUserContext();
  const isAdmin = ctx.isSuperAdmin;
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(crMonth());
  const [sellerId, setSellerId] = useState("");
  const scope = isAdmin ? sellerId || null : null;
  const statement = useQuery({
    queryKey: ["spora-statement", month, scope],
    queryFn: () => api.query(STATEMENT, { month, sellerId: scope }),
  });
  const sellers = useQuery({ queryKey: ["spora-sellers"], queryFn: () => api.query(SELLERS, {}), enabled: isAdmin });
  const invoices = useQuery({
    queryKey: ["spora-invoices", scope],
    queryFn: () => api.query(INVOICES, { sellerId: scope }),
    enabled: isAdmin,
  });
  const close = useMutation({
    mutationFn: () => api.mutate(CLOSE, { month }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["spora-statement"] });
      void queryClient.invalidateQueries({ queryKey: ["spora-invoices"] });
      toast.success(`Mes ${month} cerrado`);
    },
    onError: (err) => toast.error("No se pudo cerrar el mes", { description: err.message }),
  });

  const data = statement.data?.commissionStatement;
  const entries = (data?.entries ?? []) as Entry[];
  const dueAtClose = entries
    .filter((e) => e.autoBillableFrom)
    .sort((a, b) => (a.autoBillableFrom! < b.autoBillableFrom! ? -1 : 1));
  const sellerName = (id: string) => sellers.data?.sellers.items.find((s) => s.id === id)?.name ?? id;

  const exportCsv = () =>
    downloadCsv(`comisiones-${month}.csv`, [
      [
        "pedido",
        "tienda",
        "fecha",
        "estado",
        "moneda",
        "base",
        "base_tipo",
        "porcentaje",
        "comision",
        "mes_facturacion",
        "nota",
      ],
      ...entries.map((e) => [
        e.orderCode,
        e.storeName,
        e.placedAt,
        e.status,
        e.currency,
        (e.baseAmount / 100).toFixed(2),
        e.baseIncludesTax ? "con IVA (anterior al cambio)" : "sin IVA",
        e.percentage,
        (e.amount / 100).toFixed(2),
        e.billingMonth ?? "",
        e.closedWithoutDelivery
          ? "facturado al cierre sin confirmar entrega"
          : e.autoBillableFrom
            ? `se factura al cierre desde ${e.autoBillableFrom} si no se entrega`
            : "",
      ]),
    ]);

  return (
    <Page pageId="spora-comisiones">
      <PageTitle>Comisiones</PageTitle>
      <PageLayout>
        <PageBlock column="main" blockId="spora-comisiones-filtros">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="mes">Mes</Label>
              <Input id="mes" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </div>
            {isAdmin && (
              <div className="grid gap-1.5">
                <Label htmlFor="comercio">Comercio</Label>
                <select
                  id="comercio"
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  value={sellerId}
                  onChange={(e) => setSellerId(e.target.value)}
                >
                  <option value="">Todos</option>
                  {sellers.data?.sellers.items.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <Button variant="outline" id="csv" onClick={exportCsv}>
              Exportar CSV
            </Button>
            <Button variant="outline" onClick={() => printStatement(`Comisiones ${month}`, entries)}>
              Imprimir / PDF
            </Button>
            {isAdmin && (
              <Button
                id="cerrar"
                disabled={close.isPending}
                onClick={() => {
                  if (
                    confirm(
                      `¿Cerrar ${month}? Lo facturable pasa a facturado, y lo pendiente con los días de gracia cumplidos se factura sin confirmar entrega.`,
                    )
                  )
                    close.mutate();
                }}
              >
                Cerrar el mes
              </Button>
            )}
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            La base es el subtotal de productos <strong>sin IVA</strong> ni envío (el IVA es de Hacienda, no del
            comercio). Pendiente: aún sin entregar. Facturable: entregado este mes. Facturado: ya en un estado de
            cuenta. En disputa: el cliente dijo que no lo recibió (no se factura).
          </p>
        </PageBlock>

        <PageBlock column="main" blockId="spora-comisiones-totales" title="Totales del mes">
          <SimpleTable
            head={["Moneda", "Pendiente", "Facturable", "Facturado", "Anulado", "En disputa"]}
            rows={(data?.totals ?? []).map((t) => [t.currency, ...TOTALS.map((k) => money(t[k], t.currency))])}
            empty="Sin movimientos este mes."
          />
        </PageBlock>

        {dueAtClose.length > 0 && (
          <PageBlock
            column="main"
            blockId="spora-comisiones-por-cierre"
            title="Se facturarán al cierre sin confirmar entrega"
          >
            <p className="mb-2 text-sm text-muted-foreground">
              Pedidos pendientes que nadie marcó como entregados. Desde la fecha indicada, el cierre de mes los factura
              igual. Si ya los entregó, márquelos como entregados; si no se van a entregar, cancélelos.
            </p>
            <div id="por-cierre">
              <SimpleTable
                head={["Pedido", "Tienda", "Fecha del pedido", "Se factura al cierre desde", "Comisión"]}
                rows={dueAtClose.map((e) => [
                  <OrderLink id={e.orderId} code={e.orderCode} />,
                  e.storeName,
                  showDay(e.placedAt),
                  showDay(`${e.autoBillableFrom}T12:00:00-06:00`),
                  money(e.amount, e.currency),
                ])}
                empty=""
              />
            </div>
          </PageBlock>
        )}

        <PageBlock column="main" blockId="spora-comisiones-movimientos" title="Movimientos">
          <div id="movimientos">
            <SimpleTable
              head={["Pedido", "Tienda", "Fecha", "Estado", "Base sin IVA", "%", "Comisión"]}
              rows={entries.map((e) => [
                <OrderLink id={e.orderId} code={e.orderCode} />,
                e.storeName,
                showDay(e.placedAt),
                <span>
                  <Badge variant="outline">{STATUS_LABELS[e.status] ?? e.status}</Badge>
                  {e.closedWithoutDelivery && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      facturado al cierre sin confirmar entrega
                    </span>
                  )}
                </span>,
                `${money(e.baseAmount, e.currency)}${e.baseIncludesTax ? " *" : ""}`,
                `${e.percentage} %`,
                money(e.amount, e.currency),
              ])}
              empty={statement.isLoading ? "Cargando…" : "Sin movimientos este mes."}
            />
          </div>
          {entries.some((e) => e.baseIncludesTax) && (
            <p className="mt-2 text-xs text-muted-foreground">
              * Movimiento anterior al cambio: su base incluye IVA y no se recalculó.
            </p>
          )}
        </PageBlock>

        {isAdmin && (
          <PageBlock column="main" blockId="spora-comisiones-facturas" title="Estados de cuenta emitidos">
            <SimpleTable
              head={["Mes", "Comercio", "Moneda", "Movimientos", "Total"]}
              rows={(invoices.data?.commissionInvoices ?? []).map((i) => [
                i.month,
                sellerName(String(i.sellerId)),
                i.currency,
                i.entryCount,
                money(i.total, i.currency),
              ])}
              empty="Todavía no se cerró ningún mes."
            />
          </PageBlock>
        )}
      </PageLayout>
    </Page>
  );
}
