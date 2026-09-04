import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { Button } from "../components/ui/Button";
import { ThemeToggle } from "../components/ui/ThemeToggle";

export function LoginPage() {
  const { login, error } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@valeverde.rpps.gov.br");
  const [password, setPassword] = useState("demo1234");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/");
    } catch {
      // erro já exposto via contexto
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="absolute right-5 top-5 rounded-full bg-sidebar p-1">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src="/logo-npi.png" alt="NPI Brasil" className="mb-3 h-11 w-11 object-contain" />
          <p className="font-display text-2xl font-bold text-ink">Regula RPPS</p>
          <p className="mt-1 text-sm text-ink-muted">Controle de compliance e transparência ativa</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-surface p-6 shadow-soft">
          <label className="block text-sm font-medium text-ink">
            E-mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-petrol"
              required
            />
          </label>

          <label className="mt-4 block text-sm font-medium text-ink">
            Senha
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-petrol"
              required
            />
          </label>

          {error && <p className="mt-3 text-sm text-crit">{error}</p>}

          <Button type="submit" className="mt-6 w-full" disabled={submitting}>
            {submitting ? "Entrando…" : "Entrar"}
          </Button>

          <p className="mt-4 text-center text-xs text-ink-muted">
            Demo: admin@valeverde.rpps.gov.br / demo1234
          </p>
        </form>
      </div>
    </div>
  );
}
