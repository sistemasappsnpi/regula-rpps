import { useCallback, useEffect, useMemo, useState } from "react";
import { History } from "lucide-react";
import { api, type PortalDocumentoCatalogo, type PortalIndicadorCatalogo, type PortalIndicadorValor } from "../lib/api";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";

function mesAtual(): string {
  return new Date().toISOString().slice(0, 7);
}

// Lançamento manual dos indicadores do Portal Previdenciário (ver PortalDocumento/PortalIndicador,
// cadastrados pelo Admin Global) — via alternativa ao envio de PDF pelo Construtor de Documentos
// (ver /construtor) para quando o RPPS não tem um PDF pra enviar. O "vigente" de cada indicador é
// por competência (mês/ano), não único como no Pró-Gestão — por isso a competência é escolhida
// uma vez no topo da página e vale pra todos os lançamentos daquela sessão de edição.
export function PortalIndicadoresLancamentoPage() {
  const [documentos, setDocumentos] = useState<PortalDocumentoCatalogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [competencia, setCompetencia] = useState(mesAtual());
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [historicoAberto, setHistoricoAberto] = useState<string | null>(null);
  const [historico, setHistorico] = useState<PortalIndicadorValor[]>([]);

  const carregar = useCallback(async () => {
    const res = await api.listPortalIndicadoresCatalogo();
    setDocumentos(res.documentos);
  }, []);

  useEffect(() => {
    carregar().finally(() => setLoading(false));
  }, [carregar]);

  const valorNaCompetencia = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const doc of documentos) {
      for (const indicador of doc.indicadores) {
        const vigente = indicador.valoresAtuais.find((v) => v.competencia.slice(0, 7) === competencia);
        if (vigente) mapa.set(indicador.id, vigente.valor);
      }
    }
    return mapa;
  }, [documentos, competencia]);

  function valorAtual(indicador: PortalIndicadorCatalogo): string {
    if (indicador.id in rascunho) return rascunho[indicador.id];
    return valorNaCompetencia.get(indicador.id) ?? "";
  }

  function alterar(indicadorId: string, valor: string) {
    setRascunho((prev) => ({ ...prev, [indicadorId]: valor }));
  }

  async function salvar() {
    setErro(null);
    setSalvando(true);
    try {
      for (const [indicadorId, valor] of Object.entries(rascunho)) {
        if (!valor.trim()) continue;
        if (valor === (valorNaCompetencia.get(indicadorId) ?? "")) continue;
        await api.setIndicadorValor(indicadorId, competencia, valor);
      }
      setRascunho({});
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar valores.");
    } finally {
      setSalvando(false);
    }
  }

  async function verHistorico(indicadorId: string) {
    if (historicoAberto === indicadorId) {
      setHistoricoAberto(null);
      return;
    }
    const res = await api.indicadorHistorico(indicadorId);
    setHistorico(res.historico);
    setHistoricoAberto(indicadorId);
  }

  if (loading) return <p className="text-sm text-ink-muted">Carregando…</p>;

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink">Portal Previdenciário — Indicadores</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Lance manualmente o valor de cada indicador do catálogo por competência (mês/ano). Se preferir, envie um
          PDF pelo Construtor de Documentos e revise as sugestões extraídas por IA.
        </p>
      </header>

      <Card className="mb-6 p-5">
        <label className="text-sm font-medium text-ink">
          Competência
          <input
            type="month"
            className="mt-1 block w-48 rounded-lg border border-border bg-surface p-2 text-sm"
            value={competencia}
            onChange={(e) => setCompetencia(e.target.value)}
          />
        </label>
      </Card>

      {documentos.length === 0 ? (
        <Card className="p-5">
          <p className="text-sm text-ink-muted">
            Nenhum documento cadastrado ainda no catálogo. Peça ao Super Admin para cadastrar em Parametrizações →
            Portal Previdenciário — Indicadores.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {documentos.map((doc) => (
            <Card key={doc.id} className="p-5">
              <p className="mb-3 font-display text-base font-bold text-ink">{doc.nome}</p>
              <div className="flex flex-col gap-3">
                {doc.indicadores.map((indicador) => {
                  // MOEDA fica como texto livre (não "number"): o padrão brasileiro usa vírgula
                  // decimal ("1.500.000,50"), que um <input type="number"> rejeita silenciosamente
                  // (o campo aparenta ficar vazio mesmo com valor já lançado).
                  const inputType = indicador.tipo === "NUMERICO" ? "number" : indicador.tipo === "DATA" ? "date" : "text";
                  return (
                    <div key={indicador.id} className="rounded-lg border border-border p-3">
                      <div className="flex flex-wrap items-end justify-between gap-2">
                        <label className="flex-1 text-xs text-ink-muted">
                          {indicador.nome}
                          {indicador.unidade ? ` (${indicador.unidade})` : ""}
                          <input
                            type={inputType}
                            inputMode={indicador.tipo === "MOEDA" ? "decimal" : undefined}
                            placeholder={indicador.tipo === "MOEDA" ? "0,00" : undefined}
                            className="mt-1 block w-full rounded-lg border border-border bg-surface p-2 text-sm"
                            value={valorAtual(indicador)}
                            onChange={(e) => alterar(indicador.id, e.target.value)}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => verHistorico(indicador.id)}
                          className="flex items-center gap-1 text-xs text-ink-muted hover:text-ink"
                          title="Ver histórico"
                        >
                          <History size={13} /> Histórico
                        </button>
                      </div>
                      {historicoAberto === indicador.id && (
                        <div className="mt-2 rounded-lg bg-ink/5 p-2 text-xs text-ink-muted">
                          {historico.length === 0 ? (
                            <p>Nenhum valor lançado ainda.</p>
                          ) : (
                            historico.map((h) => (
                              <p key={h.id}>
                                {h.competencia.slice(0, 7)} — {h.valor} ({h.origem === "MANUAL" ? "manual" : "PDF"}, por{" "}
                                {h.criadoPor.name} em {new Date(h.createdAt).toLocaleDateString("pt-BR")})
                              </p>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}

      {erro && <p className="mt-3 text-sm text-crit">{erro}</p>}

      {documentos.length > 0 && (
        <div className="mt-4 flex justify-end">
          <Button onClick={salvar} disabled={salvando || Object.keys(rascunho).length === 0}>
            {salvando ? "Salvando…" : "Salvar alterações"}
          </Button>
        </div>
      )}
    </div>
  );
}
