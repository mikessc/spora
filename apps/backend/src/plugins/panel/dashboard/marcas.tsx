// "Marcas" (solo admin de Spora): las marcas del catálogo global con su estado; aprobar, rechazar y fusionar duplicados.
import { graphql } from "@/gql";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Badge, Button, Page, PageBlock, PageLayout, PageTitle, toast } from "@vendure/dashboard";
import { useState } from "react";
import { SimpleTable } from "./common";
import { BRANDS } from "./selectores";

const APPROVE = graphql(`
  mutation SporaApproveBrand($id: ID!) {
    approveBrand(id: $id) {
      id
    }
  }
`);
const REJECT = graphql(`
  mutation SporaRejectBrand($id: ID!) {
    rejectBrand(id: $id) {
      id
    }
  }
`);
const MERGE = graphql(`
  mutation SporaMergeBrands($sourceId: ID!, $targetId: ID!) {
    mergeBrands(sourceId: $sourceId, targetId: $targetId) {
      name
    }
  }
`);

const FILTERS = [
  ["propuesta", "Propuestas"],
  ["aprobada", "Aprobadas"],
  ["rechazada", "Rechazadas"],
  ["fusionada", "Fusionadas"],
  ["", "Todas"],
] as const;

export function BrandsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["spora-brands"], queryFn: () => api.query(BRANDS, {}) });
  const [filter, setFilter] = useState<string>("propuesta");
  const [mergeInto, setMergeInto] = useState<Record<string, string>>({});
  const all = data?.brands ?? [];
  const name = (id?: string | null) => all.find((b) => b.id === id)?.name ?? "";
  const done = (message: string) => () => {
    void queryClient.invalidateQueries({ queryKey: ["spora-brands"] });
    toast.success(message);
  };
  const failed = (err: Error) => toast.error("No se pudo", { description: err.message });
  const approve = useMutation({
    mutationFn: (id: string) => api.mutate(APPROVE, { id }),
    onSuccess: done("Marca aprobada"),
    onError: failed,
  });
  const reject = useMutation({
    mutationFn: (id: string) => api.mutate(REJECT, { id }),
    onSuccess: done("Marca rechazada: sus productos quedaron sin marca"),
    onError: failed,
  });
  const merge = useMutation({
    mutationFn: ({ sourceId, targetId }: { sourceId: string; targetId: string }) =>
      api.mutate(MERGE, { sourceId, targetId }),
    onSuccess: done("Marcas fusionadas: los productos pasaron a la marca vigente"),
    onError: failed,
  });
  const shown = all.filter((b) => !filter || b.status === filter);
  const targets = all.filter((b) => b.status === "aprobada" || b.status === "propuesta");

  return (
    <Page pageId="spora-marcas">
      <PageTitle>Marcas</PageTitle>
      <PageLayout>
        <PageBlock column="main" blockId="spora-marcas">
          <p className="mb-3 text-sm text-muted-foreground">
            Las tiendas proponen marcas desde el producto. En el marketplace solo aparecen las aprobadas. Rechazar una
            marca la quita de los productos que la usaban; fusionarla los pasa a la marca vigente.
          </p>
          <div className="mb-3 flex flex-wrap gap-2">
            {FILTERS.map(([value, label]) => (
              <Button
                key={value}
                variant={filter === value ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(value)}
              >
                {label} ({value ? all.filter((b) => b.status === value).length : all.length})
              </Button>
            ))}
          </div>
          <div id="marcas">
            <SimpleTable
              head={["Marca", "Estado", "Acciones"]}
              rows={shown.map((b) => [
                <span>
                  <span className="font-medium">{b.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{b.slug}</span>
                </span>,
                <span>
                  <Badge
                    variant={b.status === "aprobada" ? "success" : b.status === "propuesta" ? "warning" : "outline"}
                  >
                    {b.status}
                  </Badge>
                  {b.mergedIntoId && <span className="ml-2 text-xs">→ {name(b.mergedIntoId)}</span>}
                </span>,
                b.status === "fusionada" ? (
                  ""
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {b.status !== "aprobada" && (
                      <Button size="sm" onClick={() => approve.mutate(b.id)}>
                        Aprobar
                      </Button>
                    )}
                    {b.status !== "rechazada" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (confirm(`¿Rechazar «${b.name}»? Los productos que la usan quedan sin marca.`))
                            reject.mutate(b.id);
                        }}
                      >
                        Rechazar
                      </Button>
                    )}
                    <select
                      aria-label={`Fusionar ${b.name} en`}
                      className="h-8 rounded-md border bg-background px-2 text-sm"
                      value={mergeInto[b.id] ?? ""}
                      onChange={(e) => setMergeInto((m) => ({ ...m, [b.id]: e.target.value }))}
                    >
                      <option value="">Fusionar en…</option>
                      {targets
                        .filter((t) => t.id !== b.id)
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                    </select>
                    {mergeInto[b.id] && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (confirm(`¿Fusionar «${b.name}» en «${name(mergeInto[b.id])}»?`))
                            merge.mutate({ sourceId: b.id, targetId: mergeInto[b.id]! });
                        }}
                      >
                        Fusionar
                      </Button>
                    )}
                  </div>
                ),
              ])}
              empty={isLoading ? "Cargando…" : "No hay marcas en este estado."}
            />
          </div>
        </PageBlock>
      </PageLayout>
    </Page>
  );
}
