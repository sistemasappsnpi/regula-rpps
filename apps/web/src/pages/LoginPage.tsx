import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { Button } from "../components/ui/Button";
import { ThemeToggle } from "../components/ui/ThemeToggle";

// Split-screen: coluna esquerda é o "cartão de identidade" (mesmo gradiente da sidebar,
// sempre igual nos dois temas — ver DashboardShell.tsx), coluna direita é o formulário. Login
// local nunca some; os botões de SSO abaixo dele só aparecem se o backend confirmar que aquele
// provedor tem credencial configurada (GET /auth/providers) — nunca um botão morto.
export function LoginPage() {
  const { login, error: erroLocal } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const erroSso = searchParams.get("erro");

  const [email, setEmail] = useState("admin@valeverde.rpps.gov.br");
  const [password, setPassword] = useState("demo1234");
  const [submitting, setSubmitting] = useState(false);
  const [providers, setProviders] = useState<{ microsoft: boolean; govbr: boolean } | null>(null);

  useEffect(() => {
    api.ssoProviders().then(setProviders).catch(() => setProviders({ microsoft: false, govbr: false }));
  }, []);

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

  const temSso = providers?.microsoft || providers?.govbr;
  const erro = erroLocal ?? erroSso;

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Coluna de identidade — some no mobile. Fundo fixo (nunca muda com o tema claro/escuro). */}
      <div className="hidden flex-col justify-between bg-gradient-to-br from-blue-900 to-cyan-900 p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <img src="/logo-npi.png" alt="NPI Brasil" className="h-10 w-10 rounded-xl bg-white/10 object-contain" />
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-cyan-400">Plataforma NPI Brasil</p>
            <p className="font-display text-xl font-bold leading-tight">Regula RPPS</p>
          </div>
        </div>

        <div className="max-w-sm">
          <ShieldCheck size={32} className="mb-4 text-cyan-400" />
          <p className="font-display text-2xl font-bold leading-snug">
            Compliance previdenciário e transparência ativa, num só lugar.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            CRP, Pró-Gestão RPPS e Portal de Transparência — do preenchimento à publicação, com
            trilha de auditoria em cada passo.
          </p>
        </div>

        <p className="text-xs text-slate-300">© {new Date().getFullYear()} NPI Brasil</p>
      </div>

      {/* Coluna do formulário */}
      <div className="relative flex items-center justify-center bg-bg px-4 py-12">
        <div className="absolute right-5 top-5 rounded-full bg-sidebar p-1">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <img src="/logo-npi.png" alt="NPI Brasil" className="mb-3 h-11 w-11 object-contain" />
            <p className="font-display text-2xl font-bold text-ink">Regula RPPS</p>
            <p className="mt-1 text-sm text-ink-muted">Controle de compliance e transparência ativa</p>
          </div>

          <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-surface p-6 shadow-soft">
            <p className="mb-5 font-display text-lg font-bold text-ink">Acesse sua conta</p>

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

            {erro && (
              <p className="mt-3 rounded-lg border border-crit/30 bg-crit/10 px-3 py-2 text-xs font-medium text-crit">
                {erro}
              </p>
            )}

            <Button type="submit" className="mt-6 w-full" disabled={submitting}>
              {submitting ? "Entrando…" : "Entrar"}
            </Button>

            <p className="mt-4 text-center text-xs text-ink-muted">
              Demo: admin@valeverde.rpps.gov.br / demo1234
            </p>

            {temSso && (
              <>
                <div className="my-5 flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">ou</span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                <div className="flex flex-col gap-2">
                  {providers?.microsoft && (
                    <a
                      href="/api/auth/microsoft/login"
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-bg py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-ink/5"
                    >
                      <MicrosoftIcon /> Entrar com Microsoft
                    </a>
                  )}
                  {providers?.govbr && (
                    <a
                      href="/api/auth/govbr/login"
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-bg py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-ink/5"
                    >
                      <ShieldCheck size={15} className="text-ok" /> Entrar com gov.br
                    </a>
                  )}
                </div>
              </>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}
