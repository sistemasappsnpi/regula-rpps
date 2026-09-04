import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, FileStack, FileText, Sparkles } from "lucide-react";
import { api, type DocumentoPersonalizadoTenant, type ProGestaoAcao, type Upload } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";

const DIMENSOES = ["Controles Internos", "Governança Corporativa", "Educação Previdenciária"] as const;

// Biblioteca central dos documentos do Pró-Gestão RPPS — deliberadamente separada dos
// documentos/evidências do CRP (ver Central de Compliance CRP), que é um fluxo independente.
// Mostra as 24 ações; cada uma abre em página própria (upload por IA, preenchimento manual,
// lista de documentos e link para o Portal público).
export function DocumentosPage() {
  const { tenant, hasFeature } = useAuth();
  const personalizadosHabilitado = hasFeature("documentos_personalizados");
  const [acoes, setAcoes] = useState<ProGestaoAcao[]>([]);
  const [uploads, setUploads] = useState<(Upload & { acaoCodigo: string })[]>([]);
  const [personalizados, setPersonalizados] = useState<DocumentoPersonalizadoTenant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.listProGestaoAcoes(),
      api.listUploadsProGestaoTodos(),
      personalizadosHabilitado ? api.listDocumentosPersonalizados() : Promise.resolve({ documentos: [] }),
    ])
      .then(([a, u, p]) => {
        setAcoes(a.acoes);
        setUploads(u.uploads);
        setPersonalizados(p.documentos);
      })
      .finally(() => setLoading(false));
  }, [personalizadosHabilitado]);

  const fontesDaTransparencia = useMemo(() => {
    const transparencia = acoes.find((a) => a.codigo === "transparencia");
    return new Set(transparencia?.dependeDe.map((d) => d.fonteCodigo) ?? []);
  }, [acoes]);

  const contagemPorAcao = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const u of uploads) mapa.set(u.acaoCodigo, (mapa.get(u.acaoCodigo) ?? 0) + 1);
    return mapa;
  }, [uploads]);

  if (loading) return <p className="text-sm text-ink-muted">Carregando…</p>;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Documentos</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Documentos do Pró-Gestão RPPS, organizados por ação. Para documentos/evidências do CRP, veja a Central
            de Compliance CRP.
          </p>
        </div>
        <Link
          to={`/transparencia/${tenant?.slug ?? ""}`}
          target="_blank"
          rel="noreferrer"
          className="rounded-full bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-soft hover:brightness-110"
        >
          Ver Portal de Transparência →
        </Link>
      </header>

      <Card className="mb-8 p-4">
        <p className="text-sm text-ink">
          <span className="font-medium">Nível do Pró-Gestão definido pelo administrador: </span>
          {tenant?.nivelProGestaoAlvo ? (
            <Badge tone="ok">Nível {tenant.nivelProGestaoAlvo}</Badge>
          ) : (
            <span className="text-warn">nenhum ainda — os campos abaixo mostram apenas o Nível I</span>
          )}
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          É esse nível que decide quais campos de cada documento abaixo precisam ser preenchidos. Para mudar,
          peça ao Super Admin para ajustar em Admin Global → RPPS clientes → editar este RPPS.
        </p>
      </Card>

      {DIMENSOES.map((dimensao) => {
        const dasDimensao = acoes.filter((a) => a.dimensao === dimensao);
        if (dasDimensao.length === 0) return null;

        return (
          <section key={dimensao} className="mb-8">
            <h2 className="mb-3 font-display text-lg font-bold text-ink">{dimensao}</h2>
            <div className="flex flex-col gap-2">
              {dasDimensao.map((acao) => (
                <Link
                  key={acao.codigo}
                  to={`/documentos/${acao.codigo}`}
                  className="block rounded-xl border border-border bg-surface p-4 shadow-soft transition-colors hover:bg-ink/5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="font-mono text-xs text-ink-muted">{acao.numero}</span>
                      <span className="truncate text-sm font-medium text-ink">{acao.nome}</span>
                      {fontesDaTransparencia.has(acao.codigo) && (
                        <span title="Compõe a Transparência">
                          <Sparkles size={14} className="shrink-0 text-gold" />
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {contagemPorAcao.has(acao.codigo) && (
                        <span className="flex items-center gap-1 text-xs text-ink-muted">
                          <FileText size={13} /> {contagemPorAcao.get(acao.codigo)}
                        </span>
                      )}
                      <ChevronRight size={16} className="text-ink-muted" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      {personalizadosHabilitado && (
        <section className="mb-8">
          <h2 className="mb-3 font-display text-lg font-bold text-ink">Personalizados</h2>
          <div className="flex flex-col gap-2">
            {personalizados.map((d) => (
              <Link
                key={d.id}
                to={`/documentos/personalizados/${d.codigo}`}
                className="block rounded-xl border border-border bg-surface p-4 shadow-soft transition-colors hover:bg-ink/5"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <FileStack size={14} className="shrink-0 text-ink-muted" />
                    <span className="truncate text-sm font-medium text-ink">{d.nome}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {d.publicacao?.status === "APROVADO" ? (
                      <Badge tone="ok">publicado</Badge>
                    ) : (
                      <Badge tone="neutral">não publicado</Badge>
                    )}
                    <ChevronRight size={16} className="text-ink-muted" />
                  </div>
                </div>
              </Link>
            ))}
            {personalizados.length === 0 && (
              <p className="text-sm text-ink-muted">Nenhum documento personalizado disponível ainda.</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
