import { useCallback, useEffect, useMemo, useState } from "react";
import { History, Pencil, X } from "lucide-react";
import { api, type PortalDocumentoCatalogo, type PortalIndicadorCatalogo, type PortalIndicadorValor } from "../lib/api";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { dataBrParaInput, dataInputParaBr } from "../lib/br-date";

function mesAtual(): string {
  return new Date().toISOString().slice(0, 7);
}

// Lançamento manual dos indicadores do Portal Previdenciário (ver PortalDocumento/PortalIndicador,
// cadastrados pelo Admin Global) — via alternativa ao envio de PDF pelo Construtor de Documentos
// (ver /construtor) para quando o RPPS não tem um PDF pra enviar. Por padrão a página é só uma
// listagem do que já está publicado na competência escolhida — o campo de edição só aparece pro
// indicador que o usuário clicar em "Editar", pra não jogar dezenas de inputs abertos na tela de
// uma vez (documentos como o DAIR têm 40+ indicadores).
export function PortalIndicadoresLancamentoPage() {
  const [documentos, setDocumentos] = useState<PortalDocumentoCatalogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [competencia, setCompetencia] = useState(mesAtual());
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [valorEdicao, setValorEdicao] = useState("");
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
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

  function iniciarEdicao(indicador: PortalIndicadorCatalogo) {
    setErro(null);
    const bruto = valorNaCompetencia.get(indicador.id) ?? "";
    // Mesma lógica de conversão de antes: DATA guardado "dd/mm/aaaa" vira "aaaa-mm-dd" pro
    // <input type="date">; NUMERICO/MOEDA fica texto livre pq aceitam vírgula decimal (padrão BR).
    const iso = indicador.tipo === "DATA" ? dataBrParaInput(bruto) : "";
    const usarInputData = indicador.tipo === "DATA" && (bruto === "" || iso !== "");
    setValorEdicao(usarInputData ? iso : bruto);
    setEditandoId(indicador.id);
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setValorEdicao("");
  }

  async function salvarEdicao(indicador: PortalIndicadorCatalogo) {
    const usarInputData =
      indicador.tipo === "DATA" && (valorEdicao === "" || dataBrParaInput(dataInputParaBr(valorEdicao)) !== "");
    const valorFinal = usarInputData ? dataInputParaBr(valorEdicao) : valorEdicao;
    if (!valorFinal.trim()) return;

    setErro(null);
    setSalvandoId(indicador.id);
    try {
      await api.setIndicadorValor(indicador.id, competencia, valorFinal);
      setEditandoId(null);
      setValorEdicao("");
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar valor.");
    } finally {
      setSalvandoId(null);
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
        <h1 className="text-2xl font-semibold sm:text-3xl text-ink">Portal Previdenciário — Indicadores</h1>
        <p className="mt-1 text-sm text-ink-muted">
          O que já está publicado no Portal Previdenciário, por documento. Clique em "Editar" pra lançar ou corrigir
          um valor manualmente — ou envie um PDF pelo Construtor de Documentos e revise as sugestões extraídas por
          IA.
        </p>
      </header>

      <Card className="mb-6 p-5">
        <label className="text-sm font-medium text-ink">
          Competência
          <input
            type="month"
            className="mt-1 block w-48 rounded-lg border border-border bg-surface p-2 text-sm"
            value={competencia}
            onChange={(e) => {
              setCompetencia(e.target.value);
              cancelarEdicao();
            }}
          />
        </label>
      </Card>

      {erro && <p className="mb-4 text-sm text-crit">{erro}</p>}

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
              <div className="flex flex-col">
                {doc.indicadores.map((indicador) => {
                  const bruto = valorNaCompetencia.get(indicador.id) ?? "";
                  const emEdicao = editandoId === indicador.id;
                  const inputType = indicador.tipo === "DATA" && (bruto === "" || dataBrParaInput(bruto) !== "") ? "date" : "text";

                  return (
                    <div key={indicador.id} className="border-b border-border/60 py-2.5 last:border-0">
                      {!emEdicao ? (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-ink-muted">
                              {indicador.nome}
                              {indicador.unidade ? ` (${indicador.unidade})` : ""}
                            </p>
                            <p className={`mt-0.5 text-sm ${bruto ? "font-medium text-ink" : "italic text-ink-muted"}`}>
                              {bruto || "sem valor lançado nesta competência"}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-3">
                            <button
                              type="button"
                              onClick={() => verHistorico(indicador.id)}
                              className="flex items-center gap-1 text-xs text-ink-muted hover:text-ink"
                              title="Ver histórico"
                            >
                              <History size={13} /> Histórico
                            </button>
                            <button
                              type="button"
                              onClick={() => iniciarEdicao(indicador)}
                              className="flex items-center gap-1 text-xs font-medium text-petrol hover:underline"
                            >
                              <Pencil size={13} /> Editar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <label className="block text-xs text-ink-muted">
                            {indicador.nome}
                            {indicador.unidade ? ` (${indicador.unidade})` : ""}
                            <div className="mt-1 flex items-center gap-2">
                              <input
                                autoFocus
                                type={inputType}
                                inputMode={indicador.tipo === "MOEDA" || indicador.tipo === "NUMERICO" ? "decimal" : undefined}
                                placeholder={indicador.tipo === "MOEDA" ? "0,00" : undefined}
                                className="block w-full rounded-lg border border-petrol/40 bg-surface p-2 text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-petrol/40"
                                value={valorEdicao}
                                onChange={(e) => setValorEdicao(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") salvarEdicao(indicador);
                                  if (e.key === "Escape") cancelarEdicao();
                                }}
                              />
                              <Button
                                onClick={() => salvarEdicao(indicador)}
                                disabled={salvandoId === indicador.id || !valorEdicao.trim()}
                              >
                                {salvandoId === indicador.id ? "Salvando…" : "Salvar"}
                              </Button>
                              <button
                                type="button"
                                onClick={cancelarEdicao}
                                className="text-ink-muted hover:text-ink"
                                title="Cancelar"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          </label>
                        </div>
                      )}
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
    </div>
  );
}
