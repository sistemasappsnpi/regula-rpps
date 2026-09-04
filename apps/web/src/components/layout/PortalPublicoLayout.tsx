import { useState, type ReactNode } from "react";
import type { PortalMenuSecao, PortalTenantInfo } from "../../lib/api";

const ESCALA_MIN = 0.85;
const ESCALA_MAX = 1.3;
const ESCALA_PASSO = 0.1;

/**
 * Layout do Portal de Transparência público — compartilhado entre a página principal
 * (/transparencia/:slug) e as páginas de Documentos Personalizados publicados
 * (/documentos-publicos/:slug/:codigo), pra dar sensação de um único portal por trás de
 * qualquer página dele: mesmo menu (vindo da API, ver menu.ts no backend) e mesmo rodapé
 * padrão (CNPJ, contato, acessibilidade A-/A+), seguindo o padrão de portais de transparência
 * de RPPS reais (ex.: modelo ATRICON).
 */
export function PortalPublicoLayout({
  tenant,
  menu,
  children,
}: {
  tenant: PortalTenantInfo | null;
  menu: PortalMenuSecao[];
  children: ReactNode;
}) {
  const [escala, setEscala] = useState(1);

  return (
    <div style={{ fontSize: `${escala * 100}%` }} className="flex min-h-screen flex-col bg-bg">
      {menu.length > 0 && (
        <nav className="border-b border-border bg-surface px-6 py-3">
          <div className="mx-auto flex max-w-3xl flex-wrap gap-x-8 gap-y-2">
            {menu.map((secao) => (
              <div key={secao.label} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">{secao.label}:</span>
                {secao.itens.map((item) => (
                  <a key={item.href} href={item.href} className="text-sm font-medium text-petrol hover:underline">
                    {item.label}
                  </a>
                ))}
              </div>
            ))}
          </div>
        </nav>
      )}

      <main className="flex-1 px-6 py-10">{children}</main>

      <footer className="border-t border-border bg-surface px-6 py-8 text-xs text-ink-muted">
        <div className="mx-auto flex max-w-3xl flex-wrap items-start justify-between gap-8">
          <div>
            <p className="text-sm font-semibold text-ink">{tenant?.name ?? "—"}</p>
            <p className="mt-0.5">{tenant?.federatedEntity}</p>
            {tenant?.cnpj && <p className="mt-0.5">CNPJ: {tenant.cnpj}</p>}
            {tenant?.enderecoPublico && <p className="mt-0.5">{tenant.enderecoPublico}</p>}
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">Contato</p>
            {tenant?.telefonePublico && <p className="mt-1">{tenant.telefonePublico}</p>}
            {tenant?.emailPublico && <p className="mt-1">{tenant.emailPublico}</p>}
            {tenant?.site && (
              <p className="mt-1">
                <a
                  href={tenant.site.startsWith("http") ? tenant.site : `https://${tenant.site}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-petrol hover:underline"
                >
                  {tenant.site}
                </a>
              </p>
            )}
            {!tenant?.telefonePublico && !tenant?.emailPublico && !tenant?.site && <p className="mt-1">—</p>}
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">Acessibilidade</p>
            <div className="mt-1.5 flex items-center gap-1">
              <button
                onClick={() => setEscala((e) => Math.max(ESCALA_MIN, +(e - ESCALA_PASSO).toFixed(2)))}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-bg font-semibold text-ink hover:bg-ink/5"
                title="Diminuir o tamanho do texto"
              >
                A-
              </button>
              <button
                onClick={() => setEscala(1)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-bg font-semibold text-ink hover:bg-ink/5"
                title="Tamanho padrão"
              >
                A
              </button>
              <button
                onClick={() => setEscala((e) => Math.min(ESCALA_MAX, +(e + ESCALA_PASSO).toFixed(2)))}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-bg font-semibold text-ink hover:bg-ink/5"
                title="Aumentar o tamanho do texto"
              >
                A+
              </button>
            </div>
          </div>
        </div>

        <p className="mx-auto mt-6 max-w-3xl border-t border-border pt-4 text-center">
          © {new Date().getFullYear()} {tenant?.name ?? "Regula RPPS"}. Todos os direitos reservados. Portal de
          Transparência Ativa — dados publicados via API pública do Regula RPPS.
        </p>
      </footer>
    </div>
  );
}
