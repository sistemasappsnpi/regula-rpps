import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth-context";
import { DashboardShell } from "./components/layout/DashboardShell";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { CrpCompliancePage } from "./pages/CrpCompliancePage";

function RequireAuth({ children }: { children: JSX.Element }) {
  const { tenant, loading } = useAuth();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-ink-muted">Carregando…</div>;
  }
  if (!tenant) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <DashboardShell>
              <DashboardPage />
            </DashboardShell>
          </RequireAuth>
        }
      />
      <Route
        path="/crp"
        element={
          <RequireAuth>
            <DashboardShell>
              <CrpCompliancePage />
            </DashboardShell>
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
