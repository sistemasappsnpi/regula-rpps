import { useState, type ReactNode } from "react";
import { ArrowUp, ChevronDown, Clock, Mail, MapPin, Phone } from "lucide-react";
import type { PortalPrevidenciarioMenuItem, PortalPrevidenciarioRodape } from "../../lib/api";

// Cor padrão quando o tenant não configurou Tenant.portalCorPrimaria — mesma cor de
// --nav-active/--footer-bg do modelo de referência (ver acessoainformacao.html).
const COR_PADRAO = "#0a4d53";

const REDES_SOCIAIS: { key: keyof PortalPrevidenciarioRodape; label: string }[] = [
  { key: "facebook", label: "Facebook" },
  { key: "instagram", label: "Instagram" },
  { key: "twitter", label: "X (Twitter)" },
  { key: "youtube", label: "YouTube" },
  { key: "whatsapp", label: "WhatsApp" },
];

function enderecoCompleto(r: PortalPrevidenciarioRodape): string | null {
  const partes = [r.rua && r.numero ? `${r.rua}, ${r.numero}` : r.rua, r.bairro, r.cep].filter(Boolean);
  return partes.length > 0 ? partes.join(" — ") : null;
}

/**
 * Layout do Portal Previdenciário — módulo novo, distinto do Portal de Transparência
 * (ver PortalPublicoLayout): menu e rodapé vêm ao vivo das duas APIs externas configuradas por
 * cliente (Tenant.portalMenuApiUrl/portalRodapeApiUrl — ver Admin → RPPS clientes → Dados
 * Básicos), no formato do endpoint "dadosabertosexportar" usado como referência (modelo IPRES).
 */
export function PortalPrevidenciarioLayout({
  tenantNome,
  tenantLogoUrl,
  corPrimaria,
  slug,
  itemAtivoId,
  menu,
  rodape,
  sincronizadoEm,
  children,
}: {
  tenantNome: string;
  tenantLogoUrl?: string | null;
  corPrimaria?: string | null;
  slug?: string;
  itemAtivoId?: string;
  menu: PortalPrevidenciarioMenuItem[] | null;
  rodape: PortalPrevidenciarioRodape | null;
  sincronizadoEm: string | null;
  children: ReactNode;
}) {
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const cor = corPrimaria && /^#[0-9a-fA-F]{6}$/.test(corPrimaria) ? corPrimaria : COR_PADRAO;

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="border-b border-border bg-white px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center">
          <a href={slug ? `/portal-previdenciario/${slug}` : "#"} className="flex items-center gap-2">
            {tenantLogoUrl ? (
              <img src={tenantLogoUrl} alt={tenantNome} className="h-10 w-auto" />
            ) : (
              <span className="font-display text-lg font-bold text-ink">{tenantNome}</span>
            )}
          </a>
        </div>
      </header>

      {menu && menu.length > 0 && (
        <nav className="relative z-10 px-6" style={{ backgroundColor: cor }}>
          <div className="mx-auto flex max-w-5xl flex-wrap items-center">
            {menu.map((item) => {
              const ativo = item.id === itemAtivoId;
              return (
                <div
                  key={item.id}
                  className="relative"
                  onMouseEnter={() => item.itens.length > 0 && setAbertoId(item.id)}
                  onMouseLeave={() => setAbertoId((atual) => (atual === item.id ? null : atual))}
                >
                  {item.itens.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setAbertoId((atual) => (atual === item.id ? null : item.id))}
                      className="flex items-center gap-1 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white/90 hover:bg-white/10"
                      style={ativo ? { backgroundColor: "rgba(255,255,255,0.16)", color: "#fff" } : undefined}
                    >
                      {item.nome}
                      <ChevronDown size={13} className={abertoId === item.id ? "rotate-180" : ""} />
                    </button>
                  ) : (
                    <a
                      href={item.pagina}
                      target={item.novaPag === "_blank" ? "_blank" : undefined}
                      rel={item.novaPag === "_blank" ? "noreferrer" : undefined}
                      className="block px-4 py-3 text-xs font-bold uppercase tracking-wide text-white/90 hover:bg-white/10"
                      style={ativo ? { backgroundColor: "rgba(255,255,255,0.16)", color: "#fff" } : undefined}
                    >
                      {item.nome}
                    </a>
                  )}
                  {item.itens.length > 0 && abertoId === item.id && (
                    <div className="absolute left-0 top-full min-w-[220px] rounded-b-lg border border-t-0 border-border bg-white py-1 shadow-lg">
                      {item.itens.map((filho) => (
                        <a
                          key={filho.id}
                          href={filho.pagina}
                          target={filho.novaPag === "_blank" ? "_blank" : undefined}
                          rel={filho.novaPag === "_blank" ? "noreferrer" : undefined}
                          className="block px-4 py-2 text-sm text-ink hover:bg-ink/5"
                        >
                          {filho.nome}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </nav>
      )}

      <main className="flex-1 px-6 py-10">{children}</main>

      <footer className="px-6 py-10 text-sm text-white/80" style={{ backgroundColor: cor }}>
        <div className="mx-auto grid max-w-5xl gap-8 sm:grid-cols-3">
          <div>
            <p className="text-base font-semibold text-white">{tenantNome}</p>
          </div>

          <div className="flex flex-col gap-2">
            {rodape?.cnpj && <p>CNPJ: {rodape.cnpj}</p>}
            {rodape && enderecoCompleto(rodape) && (
              <p className="flex items-start gap-2">
                <MapPin size={14} className="mt-0.5 shrink-0" /> {enderecoCompleto(rodape)}
              </p>
            )}
            {rodape?.horario && (
              <p className="flex items-start gap-2">
                <Clock size={14} className="mt-0.5 shrink-0" /> {rodape.horario}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {rodape?.telefone && (
              <p className="flex items-center gap-2">
                <Phone size={14} className="shrink-0" /> {rodape.telefone}
              </p>
            )}
            {rodape?.email && (
              <p className="flex items-center gap-2">
                <Mail size={14} className="shrink-0" />
                <a href={`mailto:${rodape.email}`} className="hover:underline">
                  {rodape.email}
                </a>
              </p>
            )}
          </div>
        </div>

        {rodape && REDES_SOCIAIS.some((r) => rodape[r.key]) && (
          <div className="mx-auto mt-6 flex max-w-5xl flex-wrap gap-4 border-t border-white/10 pt-6">
            {REDES_SOCIAIS.filter((r) => rodape[r.key]).map((r) => (
              <a
                key={r.key}
                href={rodape[r.key] as string}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-white/70 hover:text-white hover:underline"
              >
                {r.label}
              </a>
            ))}
          </div>
        )}

        <div className="mx-auto mt-6 max-w-5xl border-t border-white/10 pt-4 text-center text-xs text-white/60">
          <p>
            © {new Date().getFullYear()} {tenantNome}. Todos os direitos reservados.
          </p>
          <p className="mt-1">
            {sincronizadoEm
              ? `Sincronizado com a API às ${new Date(sincronizadoEm).toLocaleTimeString("pt-BR")}.`
              : "Exibindo cópia local — API indisponível no momento."}
          </p>
        </div>
      </footer>

      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="fixed bottom-6 right-6 flex h-10 w-10 items-center justify-center rounded-full bg-petrol text-white shadow-lg hover:opacity-90"
        title="Voltar ao topo"
      >
        <ArrowUp size={18} />
      </button>
    </div>
  );
}
