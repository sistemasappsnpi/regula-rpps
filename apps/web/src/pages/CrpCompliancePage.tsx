import { useEffect, useMemo, useState } from "react";
import { api, type CrpCriterion } from "../lib/api";
import { Badge, statusLabel, statusTone } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";

export function CrpCompliancePage() {
  const [criteria, setCriteria] = useState<CrpCriterion[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string>("Todas");

  useEffect(() => {
    api
      .listCrpCriteria()
      .then((res) => setCriteria(res.criteria))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => ["Todas", ...new Set(criteria.map((c) => c.category))], [criteria]);
  const filtered = category === "Todas" ? criteria : criteria.filter((c) => c.category === category);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-ink">Central de Compliance — CRP</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Os 22 critérios oficiais do Certificado de Regularidade Previdenciária, monitorados em um só lugar.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              category === cat
                ? "border-petrol bg-petrol/10 text-petrol"
                : "border-border text-ink-muted hover:bg-ink/5"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-ink-muted">Carregando critérios…</p>}

      <div className="flex flex-col gap-3">
        {filtered.map((criterion) => {
          const tenantStatus = criterion.tenantStatuses[0];
          const status = tenantStatus?.status ?? "PENDENTE";

          return (
            <Card key={criterion.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs text-ink-muted">{criterion.code}</p>
                  <h3 className="mt-0.5 font-medium text-ink">{criterion.title}</h3>
                  <p className="mt-1 max-w-2xl text-sm text-ink-muted">{criterion.description}</p>
                </div>
                <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2 border-t border-border pt-4 text-xs text-ink-muted sm:grid-cols-3">
                <p>
                  <span className="font-medium text-ink">Periodicidade:</span> {criterion.periodicity}
                </p>
                <p>
                  <span className="font-medium text-ink">Próximo vencimento:</span>{" "}
                  {tenantStatus?.nextDueAt ? new Date(tenantStatus.nextDueAt).toLocaleDateString("pt-BR") : "—"}
                </p>
                <p className="sm:col-span-1">
                  <span className="font-medium text-ink">Base normativa:</span> {criterion.legalBasis}
                </p>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
