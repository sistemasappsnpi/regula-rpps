import type { ReactNode } from "react";
import { LayoutDashboard, ShieldCheck, ClipboardList, Sparkles } from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { AppShell, type ShellNavItem } from "./AppShell";
import { SessionMenu } from "./SessionMenu";

// Aba "Portal Previdenciário" (/portal-indicadores) tirada do menu por pedido do usuário — a tela
// não estava do jeito que ele queria, vai ser revista depois. A rota e a página continuam no
// código (só sem link nenhum apontando pra elas) pra retomar de onde parou quando for repensada.
const NAV_ITEMS = [
  { to: "/", label: "Painel", icon: LayoutDashboard, feature: null, end: true },
  { to: "/crp", label: "Compliance CRP", icon: ShieldCheck, feature: "crp_compliance" },
  { to: "/pro-gestao", label: "Pró-Gestão RPPS", icon: ClipboardList, feature: "pro_gestao" },
  { to: "/construtor", label: "Construtor", icon: Sparkles, feature: "construtor_documentos" },
] as const;

const PLAN_LABELS: Record<string, string> = {
  ESSENCIAL: "Plano Essencial",
  GESTAO: "Plano Gestão",
  PERFORMANCE: "Plano Performance",
};

export function DashboardShell({ children }: { children: ReactNode }) {
  const { user, tenant, hasFeature, logout } = useAuth();

  const items: ShellNavItem[] = NAV_ITEMS.map((item) => ({
    to: item.to,
    label: item.label,
    icon: item.icon,
    end: "end" in item ? item.end : false,
    locked: !!item.feature && !hasFeature(item.feature),
    lockedTitle: "Não incluído no plano contratado",
  }));

  return (
    <AppShell
      // Identidade do cliente logado (não da plataforma): logo parametrizado em Admin → RPPS
      // clientes → Dados Básicos; sem logo próprio, cai no logo padrão da plataforma.
      brand={{
        logo: tenant?.logoUrl || "/logo-npi.png",
        title: tenant?.name ?? "Regula RPPS",
        subtitle: tenant ? PLAN_LABELS[tenant.plan] : "Compliance & transparência ativa",
      }}
      sections={[{ items }]}
      footer={<SessionMenu name={user?.name ?? "Usuário"} detail={user?.email} onLogout={logout} />}
    >
      {children}
    </AppShell>
  );
}
