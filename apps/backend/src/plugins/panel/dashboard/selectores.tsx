// Marca y categoría global del producto: se eligen de una lista con búsqueda, no se escriben a mano. Desde la marca, el
// comercio puede proponer una nueva (queda "propuesta" hasta que Spora la apruebe).
import { graphql } from "@/gql";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Button, type DashboardFormComponentProps, Input, toast } from "@vendure/dashboard";
import { useMemo, useState } from "react";

export const BRANDS = graphql(`
  query SporaBrands {
    brands {
      id
      name
      slug
      status
      mergedIntoId
    }
  }
`);

const CATEGORIES = graphql(`
  query SporaMarketplaceCategories {
    marketplaceCategories {
      id
      name
      slug
      parentId
    }
  }
`);

const PROPOSE = graphql(`
  mutation SporaProposeBrand($name: String!) {
    proposeBrand(name: $name) {
      slug
      status
    }
  }
`);

type Option = { value: string; label: string; hint?: string };

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Valor actual + búsqueda + lista filtrada. `onCreate` agrega "Proponer «texto»" cuando no hay coincidencia exacta. */
function SearchSelect({
  value,
  onChange,
  options,
  placeholder,
  onCreate,
  disabled,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  options: Option[];
  placeholder: string;
  onCreate?: (text: string) => void;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const current = options.find((o) => o.value === value);
  const found = search ? options.filter((o) => plain(o.label).includes(plain(search))).slice(0, 8) : [];
  const exact = options.some((o) => plain(o.label) === plain(search.trim()));
  const pick = (next: string | null) => {
    onChange(next);
    setSearch("");
  };
  return (
    <div className="grid gap-2" data-spora-select="">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">{current ? current.label : value || "Sin elegir"}</span>
        {current?.hint && <span className="text-muted-foreground">({current.hint})</span>}
        {value && !disabled && (
          <Button type="button" variant="ghost" size="sm" onClick={() => pick(null)}>
            Quitar
          </Button>
        )}
      </div>
      {!disabled && <Input placeholder={placeholder} value={search} onChange={(e) => setSearch(e.target.value)} />}
      {(found.length > 0 || (onCreate && search.trim() && !exact)) && (
        <ul className="max-h-64 overflow-y-auto rounded-md border bg-background text-sm">
          {found.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left hover:bg-muted"
                onClick={() => pick(o.value)}
              >
                {o.label}
                {o.hint && <span className="ml-1 text-muted-foreground">({o.hint})</span>}
              </button>
            </li>
          ))}
          {onCreate && search.trim() && !exact && (
            <li>
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left font-medium text-primary hover:bg-muted"
                onClick={() => {
                  onCreate(search.trim());
                  setSearch("");
                }}
              >
                Proponer la marca «{search.trim()}»
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export function BrandSelect({ value, onChange, disabled }: DashboardFormComponentProps) {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["spora-brands"], queryFn: () => api.query(BRANDS, {}) });
  const options = (data?.brands ?? [])
    .filter((b) => b.status === "aprobada" || b.status === "propuesta")
    .map((b) => ({ value: b.slug, label: b.name, hint: b.status === "propuesta" ? "propuesta" : undefined }));
  const propose = useMutation({
    mutationFn: (name: string) => api.mutate(PROPOSE, { name }),
    onSuccess: ({ proposeBrand }) => {
      void queryClient.invalidateQueries({ queryKey: ["spora-brands"] });
      if (proposeBrand.status === "rechazada") {
        toast.error("Spora rechazó esa marca");
        return;
      }
      onChange(proposeBrand.slug);
      toast.success(
        proposeBrand.status === "propuesta"
          ? "Marca propuesta: Spora la revisa. Ya puede usarla en el producto."
          : "Esa marca ya existe: quedó elegida.",
      );
    },
    onError: (err) => toast.error("No se pudo proponer la marca", { description: err.message }),
  });
  return (
    <SearchSelect
      value={value ?? null}
      onChange={onChange}
      options={options}
      placeholder="Buscar marca…"
      onCreate={(name) => propose.mutate(name)}
      disabled={disabled}
    />
  );
}

export function CategorySelect({ value, onChange, disabled }: DashboardFormComponentProps) {
  const { data } = useQuery({ queryKey: ["spora-categories"], queryFn: () => api.query(CATEGORIES, {}) });
  const options = useMemo(() => {
    const all = data?.marketplaceCategories ?? [];
    const byId = new Map(all.map((c) => [String(c.id), c]));
    const path = (c: (typeof all)[number]): string => {
      const parent = c.parentId ? byId.get(String(c.parentId)) : undefined;
      return parent ? `${path(parent)} › ${c.name}` : c.name;
    };
    return all.map((c) => ({ value: c.slug, label: path(c) })).sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [data]);
  return (
    <SearchSelect
      value={value ?? null}
      onChange={onChange}
      options={options}
      placeholder="Buscar categoría…"
      disabled={disabled}
    />
  );
}
