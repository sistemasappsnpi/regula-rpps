import type { ReactNode } from "react";
import { LayoutDashboard, Building2, SlidersHorizontal, History, FileBarChart2 } from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { AppShell, type ShellNavItem } from "./AppShell";
import { SessionMenu } from "./SessionMenu";

const NAV_ITEMS = [
  { to: "/admin", label: "Painel", icon: LayoutDashboard, feature: "admin_painel", end: true },
  { to: "/admin/tenants", label: "RPPS clientes", icon: Building2, feature: "admin_rpps_clientes" },
  { to: "/admin/auditoria", label: "Auditoria", icon: History, feature: "admin_auditoria" },
  { to: "/admin/relatorios", label: "Relatórios", icon: FileBarChart2, feature: "admin_relatorios" },
];

const PARAMETRIZACAO_ITEMS = [
  { to: "/admin/parametrizacoes", label: "Parametrizações", icon: SlidersHorizontal, feature: "admin_parametrizacoes", end: false },
];

export function GlobalAdminShell({ children }: { children: ReactNode }) {
  const { user, hasFeature, logout } = useAuth();

  const toItems = (list: { to: string; label: string; icon: ShellNavItem["icon"]; feature: string; end?: boolean }[]): ShellNavItem[] =>
    list.map((item) => ({
      to: item.to,
      label: item.label,
      icon: item.icon,
      end: item.end ?? false,
      locked: !hasFeature(item.feature),
    }));

  return (
    <AppShell
      brand={{ logo: "/logo-npi.png", title: "Admin Global", subtitle: "Regula RPPS · plataforma" }}
      sections={[{ items: toItems(NAV_ITEMS) }, { label: "Parametrização", items: toItems(PARAMETRIZACAO_ITEMS) }]}
      footer={<SessionMenu name={user?.name ?? "Usuário"} detail={user?.email} onLogout={logout} />}
    >
      {children}
    </AppShell>
  );
}
