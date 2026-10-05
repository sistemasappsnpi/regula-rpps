import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ShieldCheck, LogIn, ArrowRight, ClipboardCheck, FileSearch, History, Lock } from "lucide-react";
import { api } from "../lib/api";
import { ThemeToggle } from "../components/ui/ThemeToggle";

const DESTAQUES = [
  { icon: ClipboardCheck, titulo: "CRP e Pró-Gestão", texto: "Critérios e ações acompanhados do preenchimento à comprovação." },
  { icon: FileSearch, titulo: "Portal de Transparência", texto: "Publicação ativa dos documentos e indicadores do seu RPPS." },
  { icon: History, titulo: "Trilha de auditoria", texto: "Cada alteração registrada: quem, quando e o quê." },
];

// Login 100% via SSO — não existe mais senha local (login e permissionamento vêm do APP
// CENTRAL, com Microsoft/gov.br mantidos em paralelo, ver central-sso.routes.ts). Os botões só
// aparecem se o backend confirmar que aquele provedor tem credencial configurada (GET
// /auth/providers) — nunca um botão morto.
export function LoginPage() {
  const [searchParams] = useSearchParams();
  const erro = searchParams.get("erro");
  const [providers, setProviders] = useState<{ central: boolean; microsoft: boolean; govbr: boolean } | null>(null);

  useEffect(() => {
    api.ssoProviders().then(setProviders).catch(() => setProviders({ central: false, microsoft: false, govbr: false }));
  }, []);

  const temOutros = !!providers && (providers.microsoft || providers.govbr);

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Coluna de identidade — some no mobile. Fundo fixo (nunca muda com o tema claro/escuro). */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 p-12 text-white lg:flex">
        <div aria-hidden className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 right-0 h-[28rem] w-[28rem] rounded-full bg-violet-500/15 blur-3xl" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(rgb(255 255 255) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "radial-gradient(ellipse at 30% 40%, black, transparent 75%)",
            WebkitMaskImage: "radial-gradient(ellipse at 30% 40%, black, transparent 75%)",
          }}
        />

        <div className="relative flex items-center gap-3">
          <img src="/logo-npi.png" alt="NPI Brasil" className="h-11 w-11 rounded-xl bg-white object-contain p-1 shadow-lift" />
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-300">Plataforma NPI Brasil</p>
            <p className="font-display text-xl font-bold leading-tight">Regula RPPS</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
            <ShieldCheck size={26} className="text-indigo-200" />
          </span>
          <p className="font-display text-3xl font-bold leading-tight tracking-tight">
            Compliance previdenciário e transparência ativa, num só lugar.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            Do preenchimento à publicação, com trilha de auditoria em cada passo.
          </p>

          <ul className="mt-8 flex flex-col gap-4">
            {DESTAQUES.map(({ icon: Icon, titulo, texto }) => (
              <li key={titulo} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.07] ring-1 ring-white/10">
                  <Icon size={17} className="text-indigo-200" />
                </span>
                <div>
                  <p className="text-sm font-semibold">{titulo}</p>
                  <p className="text-[13px] leading-snug text-slate-400">{texto}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-slate-400">© {new Date().getFullYear()} NPI Brasil</p>
      </div>

      {/* Coluna de login */}
      <div className="relative flex items-center justify-center overflow-hidden bg-bg px-4 py-12">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-petrol/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-gold/10 blur-3xl" />

        <div className="absolute right-5 top-5 z-10">
          <ThemeToggle />
        </div>

        <div className="relative w-full max-w-[420px] animate-page">
          <div className="mb-7 flex flex-col items-center text-center lg:hidden">
            <img src="/logo-npi.png" alt="NPI Brasil" className="mb-3 h-12 w-12 rounded-xl bg-white object-contain p-1 shadow-soft" />
            <p className="font-display text-2xl font-bold text-ink">Regula RPPS</p>
            <p className="mt-1 text-sm text-ink-muted">Compliance e transparência ativa</p>
          </div>

          <div className="rounded-3xl border border-border bg-surface/90 p-8 shadow-lift backdrop-blur">
            <span className="mb-5 hidden h-11 w-11 items-center justify-center rounded-2xl bg-petrol/10 text-petrol lg:flex">
              <Lock size={20} />
            </span>
            <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Bem-vindo de volta</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
              Entre com a sua conta corporativa para acessar o painel do seu RPPS.
            </p>

            {erro && (
              <p className="mt-5 rounded-xl border border-crit/30 bg-crit/10 px-3.5 py-2.5 text-xs font-medium text-crit">
                {erro}
              </p>
            )}

            <div className="mt-6 flex flex-col gap-3">
              {providers?.central && (
                <a
                  href="/api/auth/central/login"
                  className="group flex w-full items-center justify-center gap-2 rounded-xl bg-petrol py-3.5 text-sm font-semibold text-on-petrol shadow-soft ring-1 ring-inset ring-white/10 hover:brightness-125 hover:shadow-lift active:scale-[0.98]"
                >
                  <LogIn size={16} /> Entrar com APP CENTRAL
                  <ArrowRight size={16} className="transition-transform duration-150 group-hover:translate-x-0.5" />
                </a>
              )}

              {providers?.central && temOutros && (
                <div className="flex items-center gap-3 py-1 text-[11px] font-medium uppercase tracking-wider text-ink-muted">
                  <span className="h-px flex-1 bg-border" /> ou <span className="h-px flex-1 bg-border" />
                </div>
              )}

              {providers?.microsoft && (
                <a
                  href="/api/auth/microsoft/login"
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface py-3 text-sm font-semibold text-ink shadow-soft hover:border-petrol/30 hover:bg-petrol/[0.04]"
                >
                  <MicrosoftIcon /> Entrar com Microsoft
                </a>
              )}
              {providers?.govbr && (
                <a
                  href="/api/auth/govbr/login"
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface py-3 text-sm font-semibold text-ink shadow-soft hover:border-petrol/30 hover:bg-petrol/[0.04]"
                >
                  <ShieldCheck size={16} className="text-ok" /> Entrar com gov.br
                </a>
              )}
              {providers && !providers.central && !providers.microsoft && !providers.govbr && (
                <p className="text-center text-sm text-ink-muted">Nenhum provedor de login configurado neste ambiente.</p>
              )}
            </div>

            <p className="mt-6 flex items-center justify-center gap-1.5 border-t border-border pt-5 text-xs text-ink-muted">
              <ShieldCheck size={13} className="text-ok" /> Acesso seguro com login único e trilha de auditoria
            </p>
          </div>

          <p className="mt-6 text-center text-xs text-ink-muted">© {new Date().getFullYear()} NPI Brasil</p>
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
