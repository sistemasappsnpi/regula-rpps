import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { LayoutDashboard, Building2, Users, SlidersHorizontal, History, FileBarChart2, Lock } from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { SessionMenu } from "./SessionMenu";

const NAV_ITEMS = [
  { to: "/admin", label: "Painel", icon: LayoutDashboard, feature: "admin_painel" },
  { to: "/admin/tenants", label: "RPPS clientes", icon: Building2, feature: "admin_rpps_clientes" },
  { to: "/admin/usuarios", label: "Usuários", icon: Users, feature: "admin_usuarios" },
  { to: "/admin/auditoria", label: "Auditoria", icon: History, feature: "admin_auditoria" },
  { to: "/admin/relatorios", label: "Relatórios", icon: FileBarChart2, feature: "admin_relatorios" },
];

const PARAMETRIZACAO_ITEMS = [
  { to: "/admin/parametrizacoes", label: "Parametrizações", icon: SlidersHorizontal, feature: "admin_parametrizacoes" },
];

export function GlobalAdminShell({ children }: { children: ReactNode }) {
  const { user, hasFeature, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="flex w-64 shrink-0 flex-col border-r border-cyan-700/50 bg-gradient-to-br from-blue-900 to-cyan-900 px-4 py-6">
        <div className="flex items-center gap-2.5 px-2">
          <img src="/logo-npi.png" alt="NPI Brasil" className="h-9 w-9 rounded-xl object-contain" />
          <div>
            <p className="font-display text-lg font-bold leading-tight text-sidebar-ink">Admin Global</p>
            <p className="text-[11px] leading-tight text-sidebar-muted">Regula RPPS · plataforma</p>
          </div>
        </div>

        <nav className="mt-8 flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => (
            <NavItem key={item.to} {...item} end={item.to === "/admin"} status={hasFeature(item.feature) ? "active" : "locked"} />
          ))}
        </nav>

        <p className="mb-1 mt-6 px-3 text-[10px] font-bold uppercase tracking-wider text-sidebar-section">
          Parametrização
        </p>
        <nav className="flex flex-1 flex-col gap-0.5">
          {PARAMETRIZACAO_ITEMS.map((item) => (
            <NavItem key={item.to} {...item} end={false} status={hasFeature(item.feature) ? "active" : "locked"} />
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-3">
          <div className="rounded-xl bg-white/5 p-3.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-sidebar-muted">Usuário</p>
            <p className="mt-1 truncate text-sm font-semibold text-sidebar-ink">{user?.name}</p>
            <p className="mt-0.5 text-xs text-sidebar-muted">{user?.email}</p>
          </div>
          <SessionMenu onLogout={logout} />
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto px-8 py-8">{children}</main>
    </div>
  );
}

function NavItem({
  to,
  label,
  icon: Icon,
  end,
  status,
}: {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end: boolean;
  status: "active" | "locked";
}) {
  if (status === "locked") {
    return (
      <span
        className="flex items-center justify-between rounded-lg px-3 py-1.5 text-[13px] text-sidebar-muted/50"
        title="Não liberado para o seu usuário"
      >
        <span className="flex items-center gap-2">
          <Icon size={15} />
          {label}
        </span>
        <Lock size={12} />
      </span>
    );
  }

  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
          isActive ? "bg-cyan-700/30 text-cyan-400" : "text-sidebar-muted hover:bg-white/5 hover:text-sidebar-ink"
        }`
      }
    >
      <Icon size={15} />
      {label}
    </NavLink>
  );
}
