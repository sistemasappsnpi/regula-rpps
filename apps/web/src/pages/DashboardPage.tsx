import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { StatTile } from "../components/ui/Card";

interface Summary {
  total: number;
  regular: number;
  irregular: number;
  pendente: number;
  nextDueAt: string | null;
}

export function DashboardPage() {
  const { tenant } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    api.crpSummary().then(setSummary);
  }, []);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8">
        <h1 className="font-display text-2xl font-semibold text-ink">Painel geral</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {tenant?.federatedEntity} · {tenant?.seguradosCount.toLocaleString("pt-BR")} segurados
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Critérios do CRP regulares"
          value={summary ? `${summary.regular}/${summary.total}` : "—"}
          hint="Certificado de Regularidade Previdenciária"
        />
        <StatTile label="Irregulares" value={summary?.irregular ?? "—"} hint="Requerem ação imediata" />
        <StatTile label="Pendentes de envio" value={summary?.pendente ?? "—"} />
        <StatTile
          label="Próximo vencimento"
          value={summary?.nextDueAt ? new Date(summary.nextDueAt).toLocaleDateString("pt-BR") : "—"}
        />
      </section>

      <section className="mt-10 rounded-xl border border-border bg-surface p-6">
        <h2 className="font-display text-lg font-semibold">Próximos módulos</h2>
        <p className="mt-2 text-sm text-ink-muted">
          Pró-Gestão RPPS, Portal de Transparência público e Documentos/Evidências entram nas próximas
          iterações — ver <code className="rounded bg-ink/5 px-1 py-0.5 text-xs">ROADMAP.md</code> no
          repositório.
        </p>
      </section>
    </div>
  );
}
