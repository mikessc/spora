// "Disputas" (solo admin de Spora): pedidos que el cliente dijo no haber recibido. Se resuelven con una nota
// obligatoria: "Se entregó" (entregado, comisión facturable) o "No se entregó" (pedido cancelado, comisión anulada).
import { graphql } from "@/gql";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Button, Page, PageBlock, PageLayout, PageTitle, Textarea, toast } from "@vendure/dashboard";
import { useState } from "react";
import { STATEMENT } from "./comisiones";
import { crMonth, money, OrderLink, showDay, SimpleTable } from "./common";

const RESOLVE = graphql(`
  mutation SporaResolveDispute($orderId: ID!, $delivered: Boolean!, $note: String!) {
    resolveDeliveryDispute(orderId: $orderId, delivered: $delivered, note: $note)
  }
`);

function Resolve({ orderId, orderCode, onResolved }: { orderId: string; orderCode: string; onResolved: () => void }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const resolve = useMutation({
    mutationFn: (delivered: boolean) => api.mutate(RESOLVE, { orderId, delivered, note }),
    onSuccess: (_, delivered) => {
      // La comisión cambia por un evento, un instante después: la fila se saca ya y el estado de cuenta se recarga luego.
      onResolved();
      setTimeout(() => void queryClient.invalidateQueries({ queryKey: ["spora-statement"] }), 1500);
      toast.success(
        delivered
          ? `Pedido ${orderCode}: entregado; su comisión se factura`
          : `Pedido ${orderCode}: cancelado; su comisión se anula`,
      );
    },
    onError: (err) => toast.error("No se pudo resolver la disputa", { description: err.message }),
  });
  const ready = note.trim().length >= 3 && !resolve.isPending;
  return (
    <div className="grid gap-2">
      <Textarea
        rows={2}
        aria-label={`Nota de la resolución de ${orderCode}`}
        placeholder="Nota obligatoria: qué se averiguó (queda en el historial del pedido)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!ready} onClick={() => resolve.mutate(true)}>
          Se entregó
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!ready}
          onClick={() => {
            if (confirm(`¿Cancelar el pedido ${orderCode}? La comisión se anula y la contra entrega no se cobra.`))
              resolve.mutate(false);
          }}
        >
          No se entregó
        </Button>
      </div>
    </div>
  );
}

export function DisputesPage() {
  // El estado de cuenta trae las disputas de cualquier mes.
  const { data, isLoading } = useQuery({
    queryKey: ["spora-statement", crMonth(), null],
    queryFn: () => api.query(STATEMENT, { month: crMonth(), sellerId: null }),
  });
  const [resolved, setResolved] = useState<string[]>([]);
  const disputes = (data?.commissionStatement.entries ?? []).filter(
    (e) => e.status === "en_disputa" && !resolved.includes(String(e.orderId)),
  );
  return (
    <Page pageId="spora-disputas">
      <PageTitle>Disputas</PageTitle>
      <PageLayout>
        <PageBlock column="main" blockId="spora-disputas-lista" title="Pedidos en disputa">
          <p className="mb-2 text-sm text-muted-foreground">
            El cliente dijo que no recibió el pedido. Su comisión no se factura hasta resolverlo. Averigüe con la tienda
            y el transportista, deje una nota y resuelva.
          </p>
          <div id="disputas">
            <SimpleTable
              head={["Pedido", "Tienda", "Fecha del pedido", "Comisión", "Resolver"]}
              rows={disputes.map((e) => [
                <OrderLink id={e.orderId} code={e.orderCode} />,
                e.storeName,
                showDay(e.placedAt),
                money(e.amount, e.currency),
                <Resolve
                  orderId={String(e.orderId)}
                  orderCode={e.orderCode}
                  onResolved={() => setResolved((r) => [...r, String(e.orderId)])}
                />,
              ])}
              empty={isLoading ? "Cargando…" : "No hay pedidos en disputa."}
            />
          </div>
        </PageBlock>
      </PageLayout>
    </Page>
  );
}
