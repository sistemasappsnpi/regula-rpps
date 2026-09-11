import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth-context";
import { DashboardShell } from "./components/layout/DashboardShell";
import { GlobalAdminShell } from "./components/layout/GlobalAdminShell";
import { LoginPage } from "./pages/LoginPage";
import { SsoCallbackPage } from "./pages/SsoCallbackPage";
import { DashboardPage } from "./pages/DashboardPage";
import { CrpCompliancePage } from "./pages/CrpCompliancePage";
import { ProGestaoPage } from "./pages/ProGestaoPage";
import { DocumentosPage } from "./pages/DocumentosPage";
import { DocumentoDetalhePage } from "./pages/DocumentoDetalhePage";
import { DocumentoPersonalizadoDetalhePage } from "./pages/DocumentoPersonalizadoDetalhePage";
import { DocumentoPersonalizadoPublicoPage } from "./pages/DocumentoPersonalizadoPublicoPage";
import { CrpDocumentosPage } from "./pages/CrpDocumentosPage";
import { ConstrutorPage } from "./pages/ConstrutorPage";
import { PortalIndicadoresLancamentoPage } from "./pages/PortalIndicadoresLancamentoPage";
import { TransparenciaPublicaPage } from "./pages/TransparenciaPublicaPage";
import { PortalPrevidenciarioPage } from "./pages/PortalPrevidenciarioPage";
import { PortalPrevidenciarioDocumentoPage } from "./pages/PortalPrevidenciarioDocumentoPage";
import { PrimeiroAcessoPage } from "./pages/PrimeiroAcessoPage";
import { AdminDashboardPage } from "./pages/admin/AdminDashboardPage";
import { AdminTenantsPage } from "./pages/admin/AdminTenantsPage";
import { AdminUsuariosPage } from "./pages/admin/AdminUsuariosPage";
import { AdminParametrizacoesPage } from "./pages/admin/AdminParametrizacoesPage";
import { AdminAuditoriaPage } from "./pages/admin/AdminAuditoriaPage";
import { AdminRelatoriosPage } from "./pages/admin/AdminRelatoriosPage";

function Carregando() {
  return <div className="flex min-h-screen items-center justify-center text-sm text-ink-muted">Carregando…</div>;
}

// Um usuário de tenant nunca vê as telas do Admin Global, e vice-versa — o Super Admin da
// plataforma não está vinculado a nenhum tenantId (ver /apps/api/src/middleware/auth.ts).
function RequireTenantAuth({ children }: { children: JSX.Element }) {
  const { tenant, isSuperAdmin, loading } = useAuth();

  if (loading) return <Carregando />;
  if (isSuperAdmin) return <Navigate to="/admin" replace />;
  if (!tenant) return <Navigate to="/login" replace />;
  return children;
}

function RequireSuperAdmin({ children }: { children: JSX.Element }) {
  const { tenant, isSuperAdmin, loading } = useAuth();

  if (loading) return <Carregando />;
  if (!isSuperAdmin) return <Navigate to={tenant ? "/" : "/login"} replace />;
  return children;
}

// Seções do Admin Global também passam por permissionamento por usuário (ver
// requireAdminFeature em /apps/api/src/middleware/features.ts) — por padrão todo Super Admin
// vê tudo, mas uma conta pode ser restrita em Admin → Usuários → Permissões.
function RequireAdminFeature({ feature, children }: { feature: string; children: JSX.Element }) {
  const { tenant, isSuperAdmin, hasFeature, loading } = useAuth();

  if (loading) return <Carregando />;
  if (!isSuperAdmin) return <Navigate to={tenant ? "/" : "/login"} replace />;
  if (!hasFeature(feature)) return <Navigate to="/admin" replace />;
  return children;
}

// Além de exigir sessão de tenant, confere se o plano contratado inclui a feature — evita a
// página tentar buscar dado que o backend vai recusar de qualquer forma (ver requireFeature
// em /apps/api/src/middleware/features.ts, a fonte real da verdade).
function RequireTenantFeature({ feature, children }: { feature: string; children: JSX.Element }) {
  const { tenant, isSuperAdmin, hasFeature, loading } = useAuth();

  if (loading) return <Carregando />;
  if (isSuperAdmin) return <Navigate to="/admin" replace />;
  if (!tenant) return <Navigate to="/login" replace />;
  if (!hasFeature(feature)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/sso-callback" element={<SsoCallbackPage />} />
      <Route path="/transparencia/:slug" element={<TransparenciaPublicaPage />} />
      <Route path="/portal-previdenciario/:slug" element={<PortalPrevidenciarioPage />} />
      <Route path="/portal-previdenciario/:slug/:codigo" element={<PortalPrevidenciarioDocumentoPage />} />
      <Route path="/documentos-publicos/:slug/:codigo" element={<DocumentoPersonalizadoPublicoPage />} />
      <Route path="/primeiro-acesso/:token" element={<PrimeiroAcessoPage />} />

      <Route
        path="/"
        element={
          <RequireTenantAuth>
            <DashboardShell>
              <DashboardPage />
            </DashboardShell>
          </RequireTenantAuth>
        }
      />
      <Route
        path="/crp"
        element={
          <RequireTenantFeature feature="crp_compliance">
            <DashboardShell>
              <CrpCompliancePage />
            </DashboardShell>
          </RequireTenantFeature>
        }
      />
      <Route
        path="/crp/documentos"
        element={
          <RequireTenantFeature feature="crp_compliance">
            <DashboardShell>
              <CrpDocumentosPage />
            </DashboardShell>
          </RequireTenantFeature>
        }
      />
      <Route
        path="/pro-gestao"
        element={
          <RequireTenantFeature feature="pro_gestao">
            <DashboardShell>
              <ProGestaoPage />
            </DashboardShell>
          </RequireTenantFeature>
        }
      />
      <Route
        path="/documentos"
        element={
          <RequireTenantFeature feature="pro_gestao">
            <DashboardShell>
              <DocumentosPage />
            </DashboardShell>
          </RequireTenantFeature>
        }
      />
      <Route
        path="/documentos/:acaoCodigo"
        element={
          <RequireTenantFeature feature="pro_gestao">
            <DashboardShell>
              <DocumentoDetalhePage />
            </DashboardShell>
          </RequireTenantFeature>
        }
      />

      <Route
        path="/documentos/personalizados/:codigo"
        element={
          <RequireTenantFeature feature="documentos_personalizados">
            <DashboardShell>
              <DocumentoPersonalizadoDetalhePage />
            </DashboardShell>
          </RequireTenantFeature>
        }
      />

      <Route
        path="/construtor"
        element={
          <RequireTenantFeature feature="construtor_documentos">
            <DashboardShell>
              <ConstrutorPage />
            </DashboardShell>
          </RequireTenantFeature>
        }
      />
      <Route
        path="/portal-indicadores"
        element={
          <RequireTenantFeature feature="portal_previdenciario_indicadores">
            <DashboardShell>
              <PortalIndicadoresLancamentoPage />
            </DashboardShell>
          </RequireTenantFeature>
        }
      />

      <Route
        path="/admin"
        element={
          <RequireSuperAdmin>
            <GlobalAdminShell>
              <AdminDashboardPage />
            </GlobalAdminShell>
          </RequireSuperAdmin>
        }
      />
      <Route
        path="/admin/tenants"
        element={
          <RequireAdminFeature feature="admin_rpps_clientes">
            <GlobalAdminShell>
              <AdminTenantsPage />
            </GlobalAdminShell>
          </RequireAdminFeature>
        }
      />
      <Route
        path="/admin/usuarios"
        element={
          <RequireAdminFeature feature="admin_usuarios">
            <GlobalAdminShell>
              <AdminUsuariosPage />
            </GlobalAdminShell>
          </RequireAdminFeature>
        }
      />
      <Route
        path="/admin/parametrizacoes"
        element={
          <RequireAdminFeature feature="admin_parametrizacoes">
            <GlobalAdminShell>
              <AdminParametrizacoesPage />
            </GlobalAdminShell>
          </RequireAdminFeature>
        }
      />
      <Route
        path="/admin/auditoria"
        element={
          <RequireAdminFeature feature="admin_auditoria">
            <GlobalAdminShell>
              <AdminAuditoriaPage />
            </GlobalAdminShell>
          </RequireAdminFeature>
        }
      />
      <Route
        path="/admin/relatorios"
        element={
          <RequireAdminFeature feature="admin_relatorios">
            <GlobalAdminShell>
              <AdminRelatoriosPage />
            </GlobalAdminShell>
          </RequireAdminFeature>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
