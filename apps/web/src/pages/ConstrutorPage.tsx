import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileText, Plus, Sparkles, X } from "lucide-react";
import { api, type ConstrutorExecucao, type ConstrutorTipoResumo, type IndicadorSugestao, type Upload } from "../lib/api";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { ComboBox } from "../components/ui/ComboBox";
import { useConfirm } from "../components/ui/confirm-context";
import { dataBrParaInput, dataInputParaBr } from "../lib/br-date";

// Construtor de Documentos: o usuário escolhe um documento personalizado (nomeado pelo Admin
// Global em Parametrizações → Personalizados) e envia quantos PDFs-fonte quiser; a IA identifica
// sozinha os indicadores mais importantes de cada um, sem catálogo pré-cadastrado. Cada indicador
// sugerido nasce PENDENTE — precisa de revisão humana item a item antes de virar dado oficial.

// A geração é uma única chamada síncrona à API (sem streaming de progresso do backend), então esse
// progresso é simulado no cliente só para dar feedback de que algo está acontecendo durante a espera.
const MENSAGENS_MONTAGEM = [
  "Lendo os documentos enviados…",
  "Extraindo o texto de cada página…",
  "Analisando o conteúdo com a IA…",
  "Identificando os dados relevantes…",
  "Montando o documento final…",
  "Quase pronto…",
];

export function ConstrutorPage() {
  const confirmar = useConfirm();
  const [tipos, setTipos] = useState<ConstrutorTipoResumo[]>([]);
  const [execucoes, setExecucoes] = useState<ConstrutorExecucao[]>([]);
  const [loading, setLoading] = useState(true);

  const [tipoSelecionadoId, setTipoSelecionadoIdRaw] = useState("");
  // Histórico junta execuções de todos os tipos documentais — sem filtro, um cliente com vários
  // tipos configurados (DPIN, DAIR, ...) vê tudo misturado. Filtra pelo tipo escolhido acima por
  // padrão; "ver histórico completo" existe só pra quem quiser navegar por tudo de propósito.
  const [historicoTodos, setHistoricoTodos] = useState(false);
  const setTipoSelecionadoId = (id: string) => {
    setTipoSelecionadoIdRaw(id);
    setHistoricoTodos(false);
  };
  const [documentos, setDocumentos] = useState<Upload[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ConstrutorExecucao | null>(null);
  const [progressoPct, setProgressoPct] = useState(0);
  const [progressoMsgIdx, setProgressoMsgIdx] = useState(0);

  const tipoSelecionado = tipos.find((t) => t.id === tipoSelecionadoId);
  const execucoesFiltradas =
    historicoTodos || !tipoSelecionado ? execucoes : execucoes.filter((e) => e.tipoDocumento.id === tipoSelecionadoId);

  const carregar = () =>
    Promise.all([api.listConstrutorTipos(), api.listConstrutorExecucoes()]).then(([t, e]) => {
      setTipos(t.tipos);
      setExecucoes(e.execucoes);
      if (!tipoSelecionadoId && t.tipos[0]) {
        setTipoSelecionadoId(t.tipos[0].id);
      }
    });

  useEffect(() => {
    carregar().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!gerando) {
      setProgressoPct(0);
      setProgressoMsgIdx(0);
      return;
    }
    const pctInterval = setInterval(() => {
      setProgressoPct((p) => (p >= 92 ? 92 : p + (92 - p) * 0.08 + 0.5));
    }, 300);
    const msgInterval = setInterval(() => {
      setProgressoMsgIdx((i) => Math.min(i + 1, MENSAGENS_MONTAGEM.length - 1));
    }, 2800);
    return () => {
      clearInterval(pctInterval);
      clearInterval(msgInterval);
    };
  }, [gerando]);

  async function enviarArquivo(file: File) {
    setErro(null);
    setEnviando(true);
    try {
      const res = await api.uploadDocumentoConstrutor(file);
      setDocumentos((prev) => [...prev, res.documento]);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao enviar documento.");
    } finally {
      setEnviando(false);
    }
  }

  async function removerDocumento(id: string) {
    try {
      await api.deleteUpload(id);
    } catch {
      /* já pode ter sido consumido por uma geração — ignora e limpa da lista local mesmo assim */
    }
    setDocumentos((prev) => prev.filter((d) => d.id !== id));
  }

  async function montarDocumento() {
    if (!tipoSelecionadoId || documentos.length === 0) return;
    setErro(null);
    setGerando(true);
    setResultado(null);
    try {
      const execucao = await api.gerarDocumentoConstrutor(
        tipoSelecionadoId,
        documentos.map((d) => d.id),
      );
      setResultado(execucao);
      setDocumentos([]);
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao montar documento.");
    } finally {
      setGerando(false);
    }
  }

  async function aprovar(id: string) {
    setErro(null);
    try {
      const atualizada = await api.aprovarConstrutorExecucao(id);
      if (resultado?.id === id) setResultado(atualizada);
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao aprovar documento.");
    }
  }

  async function aprovarTodosIndicadores(id: string) {
    const confirmado = await confirmar({
      message:
        "Aprovar todos os indicadores pendentes desta execução? Cada valor vai ao ar imediatamente no Portal Previdenciário, sem revisão individual.",
      tone: "danger",
      confirmLabel: "Aprovar todos",
    });
    if (!confirmado) return;
    setErro(null);
    try {
      const atualizada = await api.aprovarTodosIndicadoresConstrutor(id);
      if (resultado?.id === id) setResultado(atualizada);
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao aprovar os indicadores.");
    }
  }

  async function excluirExecucao(id: string) {
    const confirmado = await confirmar({
      message: "Excluir esta execução e suas sugestões? Esta ação não pode ser desfeita.",
      tone: "danger",
      confirmLabel: "Excluir",
    });
    if (!confirmado) return;
    setErro(null);
    try {
      await api.excluirConstrutorExecucao(id);
      if (resultado?.id === id) setResultado(null);
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao excluir execução.");
    }
  }

  async function revisarIndicadorSugestao(
    id: string,
    status: "APROVADA" | "REJEITADA" | "CORRIGIDA",
    valorFinal?: string,
    competenciaFinal?: string,
  ) {
    setErro(null);
    try {
      const atualizada = await api.revisarIndicadorSugestao(id, status, valorFinal, competenciaFinal);
      setResultado((atual) =>
        atual ? { ...atual, indicadorSugestoes: atual.indicadorSugestoes.map((s) => (s.id === id ? atualizada : s)) } : atual,
      );
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao revisar sugestão.");
    }
  }

  // Adiciona manualmente uma ocorrência em branco pra um indicador com subcampos — pra quando a
  // IA achou menos ocorrências do que realmente existem no PDF (ex.: faltou um membro de comitê).
  async function adicionarOcorrencia(execucaoId: string, indicadorId: string, competencia: string) {
    setErro(null);
    try {
      const nova = await api.criarIndicadorSugestao(execucaoId, indicadorId, competencia);
      setResultado((atual) => (atual ? { ...atual, indicadorSugestoes: [...atual.indicadorSugestoes, nova] } : atual));
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao adicionar ocorrência.");
    }
  }

  if (loading) return <p className="text-sm text-ink-muted">Carregando…</p>;

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-ink">
          <Sparkles size={22} className="text-gold" /> Construtor de Documentos
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Envie os relatórios que quiser e escolha o que quer montar — a IA identifica o que precisa de cada um e
          monta o documento final, sempre citando de onde cada informação veio.
        </p>
      </header>

      {tipos.length === 0 ? (
        <Card className="p-5">
          <p className="text-sm text-ink-muted">
            Nenhum documento configurado ainda. Peça ao Super Admin para cadastrar um em Parametrizações →
            Personalizados, com um comentário de apoio pra IA (opcional).
          </p>
        </Card>
      ) : (
        <Card className="mb-6 p-5">
          <span className="mb-1 block text-sm font-medium text-ink">O que você quer montar?</span>

          <ComboBox
            value={tipoSelecionadoId}
            onChange={setTipoSelecionadoId}
            placeholder="Busque pelo nome do documento…"
            options={tipos.map((t) => ({ value: t.id, label: t.nome }))}
          />

          <div className="mt-4">
            <p className="mb-1 text-sm font-medium text-ink">Documentos-fonte ({documentos.length})</p>
            <input
              type="file"
              accept="application/pdf"
              disabled={enviando}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) enviarArquivo(file);
                e.target.value = "";
              }}
              className="text-sm text-ink-muted"
            />
            {enviando && <p className="mt-2 text-xs text-ink-muted">Enviando e extraindo texto…</p>}

            <div className="mt-3 flex flex-col gap-2">
              {documentos.map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-lg border border-border p-2.5">
                  <span className="flex items-center gap-1.5 text-sm text-ink">
                    <FileText size={14} className="text-ink-muted" /> {d.nomeArquivo}
                  </span>
                  <button onClick={() => removerDocumento(d.id)} className="text-ink-muted hover:text-crit" title="Remover">
                    <X size={15} />
                  </button>
                </div>
              ))}
              {documentos.length === 0 && <p className="text-xs text-ink-muted">Nenhum documento enviado ainda.</p>}
            </div>
          </div>

          {erro && <p className="mt-3 text-sm text-crit">{erro}</p>}

          <div className="mt-4 flex justify-end">
            <Button onClick={montarDocumento} disabled={gerando || documentos.length === 0 || !tipoSelecionadoId}>
              {gerando ? "Montando…" : "Montar documento"}
            </Button>
          </div>

          {gerando && (
            <div className="mt-4">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
                <div
                  className="h-full rounded-full bg-gold transition-[width] duration-300 ease-out"
                  style={{ width: `${progressoPct}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-ink-muted">{MENSAGENS_MONTAGEM[progressoMsgIdx]}</p>
            </div>
          )}
        </Card>
      )}

      {resultado && (
        <Card className="mb-6 p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-ink">Resultado: {resultado.tipoDocumento.nome}</p>
            <div className="flex items-center gap-2">
              <Badge tone={resultado.status === "APROVADO" ? "ok" : "warn"}>
                {resultado.status === "APROVADO" ? "Aprovado" : "Rascunho — revise antes de aprovar"}
              </Badge>
              {resultado.tipoDocumento.referenciaTipo === "PERSONALIZADO" &&
                resultado.indicadorSugestoes.some((s) => s.status === "PENDENTE") && (
                  <Button onClick={() => aprovarTodosIndicadores(resultado.id)}>Aprovar todos</Button>
                )}
              {resultado.status !== "APROVADO" && <Button onClick={() => aprovar(resultado.id)}>Aprovar</Button>}
              <Button variant="ghost" onClick={() => excluirExecucao(resultado.id)}>
                Excluir
              </Button>
            </div>
          </div>

          {/* Mesma mensagem de erro do formulário lá em cima, repetida aqui — com uma lista de
              70+ campos pra revisar, "Aprovar todos" fica muito longe do erro que aparece só no
              topo da página, e passava despercebido (mesmo problema já corrigido no modal de
              Parametrizações). */}
          {erro && <p className="mb-3 text-sm text-crit">{erro}</p>}

          {resultado.tipoDocumento.referenciaTipo === "PERSONALIZADO" ? (
            resultado.indicadorSugestoes.length === 0 ? (
              <p className="text-sm text-ink-muted">Nenhum indicador foi encontrado nos documentos enviados.</p>
            ) : (
              <SugestoesRevisao resultado={resultado} onRevisar={revisarIndicadorSugestao} onAdicionarOcorrencia={adicionarOcorrencia} />
            )
          ) : (
            <>
              <div className="whitespace-pre-wrap rounded-lg bg-ink/5 p-4 text-sm text-ink">{resultado.conteudo}</div>

              {resultado.citacoes.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">Fontes citadas</p>
                  <div className="flex flex-col gap-2">
                    {resultado.citacoes.map((c, i) => (
                      <div key={i} className="rounded-lg border border-border p-2.5 text-xs">
                        <p className="text-ink-muted">
                          <span className="font-medium text-ink">{c.documentoNome}</span>
                          {c.paginaOrigem ? ` · pág. ${c.paginaOrigem}` : ""}
                        </p>
                        <p className="mt-1 italic text-ink-muted">"{c.trecho}"</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {execucoes.length > 0 && (
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-bold text-ink">Histórico</h2>
            {execucoesFiltradas.length !== execucoes.length && (
              <button
                type="button"
                onClick={() => setHistoricoTodos(true)}
                className="text-xs font-medium text-petrol hover:underline"
              >
                Ver histórico completo ({execucoes.length})
              </button>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {execucoesFiltradas.length === 0 && (
              <p className="text-sm text-ink-muted">Nenhuma execução de "{tipoSelecionado?.nome}" ainda.</p>
            )}
            {execucoesFiltradas.map((e) => (
              <div key={e.id} className="flex items-center justify-between rounded-xl border border-border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{e.tipoDocumento.nome}</p>
                  <p className="text-xs text-ink-muted">
                    {new Date(e.geradoEm).toLocaleString("pt-BR")} · {e.documentos.length} documento(s)-fonte
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={e.status === "APROVADO" ? "ok" : "warn"}>{e.status === "APROVADO" ? "Aprovado" : "Rascunho"}</Badge>
                  <Button variant="ghost" onClick={() => setResultado(e)}>
                    Ver
                  </Button>
                  <Button variant="ghost" onClick={() => excluirExecucao(e.id)}>
                    Excluir
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

type OnRevisar = (id: string, status: "APROVADA" | "REJEITADA" | "CORRIGIDA", valorFinal?: string, competenciaFinal?: string) => void;

// Separa as sugestões escalares (um valor por competência, revisão de sempre) das sugestões de
// indicador com subcampos (agrupadas por indicador+competência, uma ocorrência por linha —
// ex.: um membro de comitê) — a IA nunca inventa essa distinção, ela já vem do catálogo
// (PortalIndicador.subcampos, ver checklist em Parametrizações).
function SugestoesRevisao({
  resultado,
  onRevisar,
  onAdicionarOcorrencia,
}: {
  resultado: ConstrutorExecucao;
  onRevisar: OnRevisar;
  onAdicionarOcorrencia: (execucaoId: string, indicadorId: string, competencia: string) => void;
}) {
  const escalares: IndicadorSugestao[] = [];
  const gruposMap = new Map<string, IndicadorSugestao[]>();
  for (const s of resultado.indicadorSugestoes) {
    if ((s.indicador?.subcampos.length ?? 0) > 0) {
      const chave = `${s.indicadorId}|${s.competencia}`;
      const arr = gruposMap.get(chave) ?? [];
      arr.push(s);
      gruposMap.set(chave, arr);
    } else {
      escalares.push(s);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {escalares.map((s) => (
        <IndicadorSugestaoCard key={s.id} sugestao={s} onRevisar={onRevisar} />
      ))}
      {[...gruposMap.values()].map((ocorrencias) => (
        <GrupoSugestaoCard
          key={`${ocorrencias[0].indicadorId}|${ocorrencias[0].competencia}`}
          ocorrencias={ocorrencias}
          onRevisar={onRevisar}
          onAdicionarOcorrencia={() =>
            onAdicionarOcorrencia(resultado.id, ocorrencias[0].indicadorId, ocorrencias[0].competencia.slice(0, 7))
          }
        />
      ))}
    </div>
  );
}

function IndicadorSugestaoCard({ sugestao, onRevisar }: { sugestao: IndicadorSugestao; onRevisar: OnRevisar }) {
  const tipo = sugestao.indicador?.tipo ?? "TEXTO";
  const valorSugeridoBruto = sugestao.valorFinal ?? sugestao.valorSugerido;
  // Datas vêm da IA em dd/mm/aaaa (igual ao documento-fonte). <input type="date"> só aceita
  // aaaa-mm-dd — convertemos pra exibir/editar e voltamos ao salvar. Se o valor tiver hora junto
  // (ex.: timestamp de assinatura "28/04/2026 16:21:57"), a conversão falha e caímos pra texto
  // livre, pra não esconder o valor real num campo que não consegue representá-lo.
  const valorDataConvertido = tipo === "DATA" ? dataBrParaInput(valorSugeridoBruto) : "";
  const usarInputData = tipo === "DATA" && valorDataConvertido !== "";

  const [valor, setValor] = useState(usarInputData ? valorDataConvertido : valorSugeridoBruto);
  const [competencia, setCompetencia] = useState(sugestao.competencia.slice(0, 7));
  const decidido = sugestao.status !== "PENDENTE";
  // NUMERICO e MOEDA ficam como texto livre — <input type="number"> rejeita vírgula decimal
  // (padrão BR) e deixaria o campo parecendo vazio mesmo com um valor sugerido preenchido.
  const inputType = usarInputData ? "date" : "text";

  function valorParaSalvar(): string {
    return usarInputData ? dataInputParaBr(valor) : valor;
  }

  function salvar(status: "APROVADA" | "CORRIGIDA") {
    onRevisar(sugestao.id, status, valorParaSalvar(), `${competencia}-01`);
  }

  return (
    <div className={`rounded-lg p-3 ${sugestao.encontrado ? "bg-ink/5" : "border border-warn/40 bg-warn/5"}`}>
      {!sugestao.encontrado && (
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-warn">
          <AlertTriangle size={13} /> Não encontrado no PDF — preencha manualmente ou rejeite.
        </p>
      )}
      <p className="mb-2 text-sm font-medium text-ink">
        {sugestao.indicador?.nome ?? sugestao.indicadorId}
        {sugestao.indicador?.unidade ? <span className="ml-1 text-xs text-ink-muted">({sugestao.indicador.unidade})</span> : null}
      </p>
      <div className="flex flex-wrap gap-2">
        <label className="text-xs text-ink-muted">
          Competência
          <input
            type="month"
            className="mt-0.5 block rounded-lg border border-border bg-surface p-2 text-sm"
            value={competencia}
            disabled={decidido}
            onChange={(e) => setCompetencia(e.target.value)}
          />
        </label>
        <label className="flex-1 text-xs text-ink-muted">
          Valor
          <input
            type={inputType}
            inputMode={tipo === "MOEDA" || tipo === "NUMERICO" ? "decimal" : undefined}
            className="mt-0.5 block w-full rounded-lg border border-border bg-surface p-2 text-sm"
            value={valor}
            disabled={decidido}
            onChange={(e) => setValor(e.target.value)}
          />
        </label>
      </div>
      {(sugestao.documentoNomeOrigem || sugestao.trechoOrigem) && (
        <p className="mt-2 text-xs text-ink-muted">
          {sugestao.documentoNomeOrigem}
          {sugestao.paginaOrigem ? `, pág. ${sugestao.paginaOrigem}` : ""}
          {sugestao.trechoOrigem ? `: "${sugestao.trechoOrigem}"` : ""}
        </p>
      )}
      {decidido ? (
        <p className="mt-2 text-xs font-medium text-ink-muted">Status: {sugestao.status.toLowerCase()}</p>
      ) : (
        <div className="mt-2 flex gap-2">
          <Button
            onClick={() => {
              const inalterado =
                sugestao.encontrado &&
                valorParaSalvar() === sugestao.valorSugerido &&
                `${competencia}-01` === sugestao.competencia.slice(0, 10);
              salvar(inalterado ? "APROVADA" : "CORRIGIDA");
            }}
            disabled={!valorParaSalvar().trim()}
          >
            Aprovar este indicador
          </Button>
          <Button variant="ghost" onClick={() => onRevisar(sugestao.id, "REJEITADA")}>
            Rejeitar
          </Button>
        </div>
      )}
    </div>
  );
}

// Um indicador com subcampos (ex.: "Membro do Comitê") — cada ocorrência (pessoa) é uma sugestão
// própria, mas todas aparecem juntas aqui, com um botão pra adicionar uma ocorrência que a IA não
// tenha achado.
function GrupoSugestaoCard({
  ocorrencias,
  onRevisar,
  onAdicionarOcorrencia,
}: {
  ocorrencias: IndicadorSugestao[];
  onRevisar: OnRevisar;
  onAdicionarOcorrencia: () => void;
}) {
  const primeira = ocorrencias[0];
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink">
          {primeira.indicador?.nome ?? primeira.indicadorId}
          <span className="ml-1.5 text-xs font-normal text-ink-muted">
            — {ocorrencias.length} ocorrência{ocorrencias.length === 1 ? "" : "s"}
          </span>
        </p>
        <Button variant="ghost" onClick={onAdicionarOcorrencia}>
          <Plus size={14} /> Adicionar ocorrência
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        {ocorrencias.map((s) => (
          <OcorrenciaSugestaoCard key={s.id} sugestao={s} onRevisar={onRevisar} />
        ))}
      </div>
    </div>
  );
}

function OcorrenciaSugestaoCard({ sugestao, onRevisar }: { sugestao: IndicadorSugestao; onRevisar: OnRevisar }) {
  const subcampos = sugestao.indicador?.subcampos ?? [];
  const bruto = sugestao.valorFinal ?? sugestao.valorSugerido;
  const valoresIniciais = useMemo<Record<string, string>>(() => {
    try {
      const parsed = bruto.trim() ? JSON.parse(bruto) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }, [bruto]);

  const [valores, setValores] = useState<Record<string, string>>(valoresIniciais);
  const decidido = sugestao.status !== "PENDENTE";
  const preenchido = Object.values(valores).some((v) => v?.trim());

  function salvar() {
    onRevisar(sugestao.id, sugestao.encontrado ? "APROVADA" : "CORRIGIDA", JSON.stringify(valores));
  }

  return (
    <div className={`rounded-lg p-2.5 ${sugestao.encontrado ? "bg-ink/5" : "border border-warn/40 bg-warn/5"}`}>
      {!sugestao.encontrado && (
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-warn">
          <AlertTriangle size={12} /> Não encontrado no PDF — preencha manualmente ou remova.
        </p>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {subcampos.map((sc) => (
          <label key={sc.subcampoId} className="text-xs text-ink-muted">
            {sc.nome}
            {sc.unidade ? ` (${sc.unidade})` : ""}
            <input
              className="mt-0.5 block w-full rounded-lg border border-border bg-surface p-2 text-sm"
              value={valores[sc.subcampoId] ?? ""}
              disabled={decidido}
              onChange={(e) => setValores((v) => ({ ...v, [sc.subcampoId]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      {(sugestao.documentoNomeOrigem || sugestao.trechoOrigem) && (
        <p className="mt-2 text-xs text-ink-muted">
          {sugestao.documentoNomeOrigem}
          {sugestao.paginaOrigem ? `, pág. ${sugestao.paginaOrigem}` : ""}
          {sugestao.trechoOrigem ? `: "${sugestao.trechoOrigem}"` : ""}
        </p>
      )}
      {decidido ? (
        <p className="mt-2 text-xs font-medium text-ink-muted">Status: {sugestao.status.toLowerCase()}</p>
      ) : (
        <div className="mt-2 flex gap-2">
          <Button onClick={salvar} disabled={!preenchido}>
            Aprovar esta ocorrência
          </Button>
          <Button variant="ghost" onClick={() => onRevisar(sugestao.id, "REJEITADA")}>
            Remover
          </Button>
        </div>
      )}
    </div>
  );
}
