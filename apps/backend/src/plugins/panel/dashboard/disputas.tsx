// "Disputas" (solo admin de Spora): pedidos que el cliente dijo no haber recibido. Su comisión no se factura.
import { useQuery } from "@tanstack/react-query";
import { api, Page, PageBlock, PageLayout, PageTitle } from "@vendure/dashboard";
import { STATEMENT } from "./comisiones";
import { crMonth, money, OrderLink, showDay, SimpleTable } from "./common";

export function DisputesPage() {
  // El estado de cuenta trae las disputas de cualquier mes.
  const { data, isLoading } = useQuery({
    queryKey: ["spora-statement", crMonth(), null],
    queryFn: () => api.query(STATEMENT, { month: crMonth(), sellerId: null }),
  });
  const disputes = (data?.commissionStatement.entries ?? []).filter((e) => e.status === "en_disputa");
  return (
    <Page pageId="spora-disputas">
      <PageTitle>Disputas</PageTitle>
      <PageLayout>
        <PageBlock column="main" blockId="spora-disputas-lista" title="Pedidos en disputa">
          <p className="mb-2 text-sm text-muted-foreground">
            El cliente dijo que no recibió el pedido. Su comisión no se factura hasta resolverlo.
          </p>
          <div id="disputas">
            <SimpleTable
              head={["Pedido", "Tienda", "Fecha del pedido", "Comisión"]}
              rows={disputes.map((e) => [
                <OrderLink id={e.orderId} code={e.orderCode} />,
                e.storeName,
                showDay(e.placedAt),
                money(e.amount, e.currency),
              ])}
              empty={isLoading ? "Cargando…" : "No hay pedidos en disputa."}
            />
          </div>
        </PageBlock>
      </PageLayout>
    </Page>
  );
}
