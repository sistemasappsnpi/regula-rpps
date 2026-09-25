import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, AlertTriangle, UserSquare2 } from "lucide-react";
import { api, type AdminTenant } from "../../lib/api";
import { Card, StatTile } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";

export function AdminDashboardPage() {
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .adminListTenants()
      .then((t) => setTenants(t.tenants))
      .finally(() => setLoading(false));
  }, []);

  const rppsComPendencia = tenants.filter((t) => t.crpRegular < t.crpTotal).length;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold sm:text-3xl text-ink">Painel do Admin Global</h1>
        <p className="mt-1 text-sm text-ink-muted">Visão consolidada de todos os RPPS clientes da plataforma.</p>
      </header>

      {loading && <p className="text-sm text-ink-muted">Carregando…</p>}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile label="RPPS clientes" value={tenants.length} icon={<Building2 size={18} />} tone="petrol" />
        <StatTile
          label="RPPS com pendência no CRP"
          value={rppsComPendencia}
          hint="ao menos 1 critério não regular"
          icon={<AlertTriangle size={18} />}
          tone="warn"
        />
        <StatTile
          label="Segurados sob gestão"
          value={tenants.reduce((sum, t) => sum + t.seguradosCount, 0).toLocaleString("pt-BR")}
          icon={<UserSquare2 size={18} />}
          tone="ok"
        />
      </section>

      <section className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">RPPS clientes</h2>
          <Link to="/admin/tenants" className="text-sm font-medium text-petrol hover:underline">
            Ver todos →
          </Link>
        </div>
        <Card className="p-5">
          <div className="flex flex-col divide-y divide-border">
            {tenants.slice(0, 6).map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div>
                  <p className="text-ink">{t.name}</p>
                  <p className="text-xs text-ink-muted">{t.federatedEntity}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={t.crpRegular === t.crpTotal ? "ok" : "warn"}>
                    CRP {t.crpRegular}/{t.crpTotal}
                  </Badge>
                  <Badge tone="neutral">{t.plan}</Badge>
                </div>
              </div>
            ))}
            {tenants.length === 0 && !loading && <p className="text-sm text-ink-muted">Nenhum RPPS cadastrado ainda.</p>}
          </div>
        </Card>
      </section>
    </div>
  );
}
