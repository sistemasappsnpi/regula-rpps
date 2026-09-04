import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { LayoutDashboard, ShieldCheck, ClipboardList, FileStack, Sparkles, Settings, LogOut, Lock } from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { ThemeToggle } from "../ui/ThemeToggle";

const NAV_ITEMS = [
  { to: "/", label: "Painel", icon: LayoutDashboard, feature: null },
  { to: "/crp", label: "Compliance CRP", icon: ShieldCheck, feature: "crp_compliance" },
  { to: "/pro-gestao", label: "Pró-Gestão RPPS", icon: ClipboardList, feature: "pro_gestao" },
  { to: "/documentos", label: "Documentos", icon: FileStack, feature: "pro_gestao" },
  { to: "/construtor", label: "Construtor", icon: Sparkles, feature: "construtor_documentos" },
] as const;

const SISTEMA_ITEMS = [{ to: "/configuracoes", label: "Configurações", icon: Settings }];

const PLAN_LABELS: Record<string, string> = {
  ESSENCIAL: "Plano Essencial",
  GESTAO: "Plano Gestão",
  PERFORMANCE: "Plano Performance",
};

export function DashboardShell({ children }: { children: ReactNode }) {
  const { tenant, hasFeature, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="flex w-64 shrink-0 flex-col bg-sidebar px-4 py-6">
        <div className="flex items-center gap-2.5 px-2">
          <img src="/logo-npi.png" alt="NPI Brasil" className="h-9 w-9 rounded-xl object-contain" />
          <div>
            <p className="font-display text-lg font-bold leading-tight text-sidebar-ink">Regula RPPS</p>
            <p className="text-[11px] leading-tight text-sidebar-muted">Compliance &amp; transparência ativa</p>
          </div>
        </div>

        <nav className="mt-8 flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => (
            <NavItem
              key={item.to}
              to={item.to}
              label={item.label}
              icon={item.icon}
              status={item.feature && !hasFeature(item.feature) ? "locked" : "active"}
            />
          ))}
        </nav>

        <p className="mb-1 mt-6 px-3 text-[10px] font-bold uppercase tracking-wider text-sidebar-section">Sistema</p>
        <nav className="flex flex-1 flex-col gap-0.5">
          {SISTEMA_ITEMS.map((item) => (
            <NavItem key={item.to} to={item.to} label={item.label} icon={item.icon} status="soon" />
          ))}
        </nav>

        <div className="mt-auto rounded-xl bg-white/5 p-3.5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wide text-sidebar-muted">Tenant ativo</p>
            <ThemeToggle />
          </div>
          <p className="truncate text-sm font-semibold text-sidebar-ink">{tenant?.name}</p>
          <p className="mt-0.5 text-xs font-medium text-gold">{tenant ? PLAN_LABELS[tenant.plan] : ""}</p>
          <button
            onClick={logout}
            className="mt-3 flex items-center gap-1.5 text-xs font-medium text-sidebar-muted hover:text-sidebar-ink"
          >
            <LogOut size={13} /> Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto px-8 py-8">{children}</main>
    </div>
  );
}

type NavStatus = "active" | "locked" | "soon";

function NavItem({
  to,
  label,
  icon: Icon,
  status,
}: {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  status: NavStatus;
}) {
  if (status !== "active") {
    return (
      <span
        className="flex items-center justify-between rounded-lg px-3 py-1.5 text-[13px] text-sidebar-muted/50"
        title={status === "locked" ? "Não incluído no plano contratado" : "Disponível em uma próxima etapa"}
      >
        <span className="flex items-center gap-2">
          <Icon size={15} />
          {label}
        </span>
        {status === "locked" ? (
          <Lock size={12} />
        ) : (
          <span className="rounded-full border border-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide">
            em breve
          </span>
        )}
      </span>
    );
  }

  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `flex items-center gap-2 rounded-r-lg border-l-2 py-1.5 pl-[10px] pr-3 text-[13px] font-medium transition-colors ${
          isActive
            ? "border-sidebar-section bg-sidebar-section/10 text-sidebar-section"
            : "border-transparent text-sidebar-muted hover:bg-white/5 hover:text-sidebar-ink"
        }`
      }
    >
      <Icon size={15} />
      {label}
    </NavLink>
  );
}
