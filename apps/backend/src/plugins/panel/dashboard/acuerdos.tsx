// "Acuerdos de comisión" (solo admin de Spora): el porcentaje de cada comercio, con la fecha desde la que rige.
import { graphql } from "@/gql";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Button, Input, Label, Page, PageBlock, PageLayout, PageTitle, toast } from "@vendure/dashboard";
import { useState } from "react";
import { SELLERS } from "./comisiones";
import { crDay, SimpleTable } from "./common";

const AGREEMENTS = graphql(`
  query SporaAgreements($sellerId: ID) {
    commissionAgreements(sellerId: $sellerId) {
      id
      percentage
      validFrom
    }
  }
`);

const CREATE = graphql(`
  mutation SporaCreateAgreement($sellerId: ID!, $percentage: String!, $validFrom: String!) {
    createCommissionAgreement(sellerId: $sellerId, percentage: $percentage, validFrom: $validFrom) {
      id
    }
  }
`);

export function AgreementsPage() {
  const queryClient = useQueryClient();
  const sellers = useQuery({ queryKey: ["spora-sellers"], queryFn: () => api.query(SELLERS, {}) });
  const [sellerId, setSellerId] = useState("");
  const [percentage, setPercentage] = useState("");
  const [validFrom, setValidFrom] = useState(crDay());
  const agreements = useQuery({
    queryKey: ["spora-agreements", sellerId],
    queryFn: () => api.query(AGREEMENTS, { sellerId }),
    enabled: !!sellerId,
  });
  const create = useMutation({
    mutationFn: () => api.mutate(CREATE, { sellerId, percentage, validFrom }),
    onSuccess: () => {
      setPercentage("");
      void queryClient.invalidateQueries({ queryKey: ["spora-agreements", sellerId] });
      toast.success("Acuerdo guardado");
    },
    onError: (err) => toast.error("No se pudo guardar el acuerdo", { description: err.message }),
  });

  return (
    <Page pageId="spora-acuerdos">
      <PageTitle>Acuerdos de comisión</PageTitle>
      <PageLayout>
        <PageBlock column="main" blockId="spora-acuerdos">
          <div className="grid max-w-sm gap-1.5">
            <Label htmlFor="comercio">Comercio</Label>
            <select
              id="comercio"
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={sellerId}
              onChange={(e) => setSellerId(e.target.value)}
            >
              <option value="">Elija un comercio</option>
              {sellers.data?.sellers.items.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          {sellerId && (
            <>
              <div className="mt-4">
                <SimpleTable
                  head={["Rige desde", "Porcentaje"]}
                  rows={(agreements.data?.commissionAgreements ?? []).map((a) => [a.validFrom, `${a.percentage} %`])}
                  empty="Sin acuerdo propio: rige el porcentaje por defecto (SPORA_COMISION_POR_DEFECTO)."
                />
              </div>
              <form
                className="mt-4 flex flex-wrap items-end gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  create.mutate();
                }}
              >
                <div className="grid gap-1.5">
                  <Label htmlFor="porcentaje">Porcentaje</Label>
                  <Input
                    id="porcentaje"
                    placeholder="7.5"
                    value={percentage}
                    onChange={(e) => setPercentage(e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="desde">Rige desde</Label>
                  <Input id="desde" type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
                </div>
                <Button type="submit" disabled={!percentage || create.isPending}>
                  Guardar acuerdo
                </Button>
              </form>
            </>
          )}
        </PageBlock>
      </PageLayout>
    </Page>
  );
}
