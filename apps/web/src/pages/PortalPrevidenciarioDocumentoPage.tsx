import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Building2, CalendarClock, Layers, ScrollText } from "lucide-react";
import { api, type PortalDocumentoPublicoDetalhe, type PortalPrevidenciario } from "../lib/api";
import { Card } from "../components/ui/Card";
import { PortalPrevidenciarioLayout } from "../components/layout/PortalPrevidenciarioLayout";
import { DocumentoExplorer } from "../components/portal-previdenciario/DocumentoExplorer";
import { formatarCompetenciaExtenso } from "../components/portal-previdenciario/DocumentoIndicadoresCard";
import { useAutoRefresh } from "../lib/useAutoRefresh";

// Página pública dedicada de um único documento do Portal Previdenciário (ex.:
// /portal-previdenciario/:slug/dpin) — mesmo menu/rodapé do restante do Portal Previdenciário
// (PortalPrevidenciarioLayout), mas mostrando só os indicadores deste documento, sem o filtro
// multi-documento de PortalPrevidenciarioPage. Conteúdo central: DocumentoExplorer (busca única,
// índice lateral Visão Geral/Gráficos/Campos, exportação em vários formatos).
export function PortalPrevidenciarioDocumentoPage() {
  const { slug, codigo } = useParams<{ slug: string; codigo: string }>();
  const [dados, setDados] = useState<PortalPrevidenciario | null>(null);
  const [documento, setDocumento] = useState<PortalDocumentoPublicoDetalhe | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Nada aqui é específico de um tipo documental — a contagem de lançamentos e a competência mais
  // recente saem só de vasculhar os valores publicados, então servem igual pra DPIN, DAIR ou
  // qualquer tipo documental que o cliente venha a criar.
  const { totalLancamentos, competenciaRecente } = useMemo(() => {
    const competencias = new Set<string>();
    for (const indicador of documento?.indicadores ?? []) {
      for (const v of indicador.valores) competencias.add(v.competencia);
    }
    const ordenadas = [...competencias].sort();
    return { totalLancamentos: ordenadas.length, competenciaRecente: ordenadas[ordenadas.length - 1] };
  }, [documento]);

  const carregarDados = useCallback(() => {
    if (!slug) return;
    api
      .portalPrevidenciario(slug)
      .then(setDados)
      .catch((err) => setErro(err instanceof Error ? err.message : "Erro ao carregar o Portal Previdenciário."));
  }, [slug]);

  const carregarDocumento = useCallback(() => {
    if (!slug || !codigo) return;
    api
      .portalPrevidenciarioDocumento(slug, codigo)
      .then((res) => setDocumento(res.documento))
      .catch((err) => setErro(err instanceof Error ? err.message : "Documento não encontrado."));
  }, [slug, codigo]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  useEffect(() => {
    carregarDocumento();
  }, [carregarDocumento]);

  // Sem isso, quem aprova um lançamento numa aba não vê nada mudar em outra aba já aberta nesta
  // página — busca de novo sozinha, sem precisar de F5.
  useAutoRefresh(() => {
    carregarDados();
    carregarDocumento();
  });

  if (erro) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <Card className="max-w-md p-6 text-center">
          <p className="text-sm text-ink-muted">{erro}</p>
        </Card>
      </div>
    );
  }

  return (
    <PortalPrevidenciarioLayout
      tenantNome={dados?.tenant.name ?? "Portal Previdenciário"}
      tenantLogoUrl={dados?.tenant.logoUrl}
      corPrimaria={dados?.tenant.corPrimaria}
      slug={slug}
      menu={dados?.menu ?? null}
      rodape={dados?.rodape ?? null}
      sincronizadoEm={dados?.sincronizadoEm ?? null}
    >
      <div className="mx-auto max-w-7xl">
        <div className="group relative mb-2 overflow-hidden rounded-2xl" style={{ animation: "fade-up .5s ease-out both" }}>
          <div
            className="absolute -inset-24 opacity-40"
            style={{
              background: "radial-gradient(closest-side, rgb(var(--color-petrol) / 0.35), transparent)",
              animation: "glow-shift 6s ease-in-out infinite",
            }}
          />
          <div
            className="absolute -inset-24 opacity-30"
            style={{
              background: "radial-gradient(closest-side, rgb(var(--color-gold) / 0.35), transparent)",
              animation: "glow-shift 6s ease-in-out infinite 3s",
            }}
          />
          <div className="relative rounded-2xl border border-border bg-surface/80 px-5 py-6 shadow-lift backdrop-blur sm:px-8 sm:py-8">
            <div className="flex items-start gap-4">
              {dados?.tenant.logoUrl ? (
                <div className="hidden h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-lift sm:flex">
                  {/* A logo do cliente é larga (ícone + nome escrito do lado, em branco — some no
                      nosso fundo branco). object-cover + object-left preenche a caixa inteira
                      ancorado à esquerda, cortando a parte com texto e mostrando só o ícone. */}
                  <img
                    src={dados.tenant.logoUrl}
                    alt={dados.tenant.name}
                    className="h-full w-full object-cover object-left"
                  />
                </div>
              ) : (
                <div className="hidden h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-petrol to-gold shadow-lift sm:flex">
                  <ScrollText size={34} className="text-white" strokeWidth={2} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-petrol">Documento oficial</p>
                <h1
                  className="mt-1 bg-gradient-to-r from-ink via-petrol to-ink bg-[length:200%_auto] bg-clip-text font-display text-2xl font-extrabold leading-tight text-transparent sm:text-4xl"
                  style={{ animation: "title-shimmer 5s linear infinite alternate" }}
                >
                  {documento?.nome ?? "Carregando…"}
                </h1>
                {dados && (
                  <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-ink-muted">
                    <Building2 size={15} className="shrink-0 text-petrol" />
                    {dados.tenant.federatedEntity}
                  </p>
                )}

                {documento && totalLancamentos > 0 && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg px-3 py-1 text-xs font-medium text-ink">
                      <Layers size={13} className="text-petrol" />
                      {totalLancamentos} {totalLancamentos === 1 ? "lançamento" : "lançamentos"}
                    </span>
                    {competenciaRecente && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg px-3 py-1 text-xs font-medium text-ink">
                        <CalendarClock size={13} className="text-gold" />
                        Mais recente: {formatarCompetenciaExtenso(competenciaRecente)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {!documento ? (
          <p className="mt-8 text-sm text-ink-muted">Carregando indicadores…</p>
        ) : documento.indicadores.every((i) => i.valores.length === 0) ? (
          <Card className="mt-8 p-6">
            <p className="text-sm text-ink-muted">Nenhum indicador foi lançado ainda para este documento.</p>
          </Card>
        ) : (
          <DocumentoExplorer documento={documento} slug={slug ?? ""} />
        )}
      </div>
    </PortalPrevidenciarioLayout>
  );
}
