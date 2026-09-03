import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../lib/auth-context";

const NAV_ITEMS = [
  { to: "/", label: "Painel", disabled: false },
  { to: "/crp", label: "Compliance CRP", disabled: false },
  { to: "/pro-gestao", label: "Pró-Gestão RPPS", disabled: true },
  { to: "/transparencia", label: "Transparência", disabled: true },
  { to: "/documentos", label: "Documentos", disabled: true },
  { to: "/configuracoes", label: "Configurações", disabled: true },
];

const PLAN_LABELS: Record<string, string> = {
  ESSENCIAL: "Plano Essencial",
  GESTAO: "Plano Gestão",
  PERFORMANCE: "Plano Performance",
};

export function DashboardShell({ children }: { children: ReactNode }) {
  const { tenant, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-surface px-4 py-6">
        <div className="px-2">
          <p className="font-display text-xl font-semibold text-ink">Regula RPPS</p>
          <p className="mt-1 text-xs text-ink-muted">Compliance &amp; transparência ativa</p>
        </div>

        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) =>
            item.disabled ? (
              <span
                key={item.to}
                className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-ink-muted/60"
                title="Disponível em uma próxima etapa"
              >
                {item.label}
                <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                  em breve
                </span>
              </span>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive ? "bg-petrol/10 text-petrol" : "text-ink hover:bg-ink/5"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ),
          )}
        </nav>

        <div className="mt-auto rounded-lg border border-border p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Tenant ativo</p>
          <p className="mt-1 truncate text-sm font-semibold">{tenant?.name}</p>
          <p className="mt-0.5 text-xs text-gold">{tenant ? PLAN_LABELS[tenant.plan] : ""}</p>
          <button onClick={logout} className="mt-3 text-xs font-medium text-petrol hover:underline">
            Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto px-8 py-8">{children}</main>
    </div>
  );
}
