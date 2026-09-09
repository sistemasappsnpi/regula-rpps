import { useEffect, useState } from "react";
import { FileText, Sparkles, X } from "lucide-react";
import { api, type ConstrutorExecucao, type ConstrutorTipoResumo, type IndicadorSugestao, type Upload } from "../lib/api";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { ComboBox } from "../components/ui/ComboBox";

// Construtor de Documentos: o usuário escolhe um tipo de documento (configurado pelo Admin
// Global, com um prompt específico e — quando aplicável — ligado a uma ação do Pró-Gestão ou a
// um critério do CRP) e envia quantos documentos-fonte quiser; a IA monta o documento final
// citando de qual fonte cada trecho veio. Nasce sempre RASCUNHO — precisa de aprovação humana.
type Categoria = "PADRAO" | "PERSONALIZADO";

export function ConstrutorPage() {
  const [tipos, setTipos] = useState<ConstrutorTipoResumo[]>([]);
  const [execucoes, setExecucoes] = useState<ConstrutorExecucao[]>([]);
  const [loading, setLoading] = useState(true);

  // Categoria é escolhida ANTES de abrir a busca — duas listas separadas, nunca uma lista só
  // misturando os dois tipos com um cabeçalho de grupo no meio.
  const [categoria, setCategoria] = useState<Categoria>("PADRAO");
  const [tipoSelecionadoId, setTipoSelecionadoId] = useState("");
  const [documentos, setDocumentos] = useState<Upload[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ConstrutorExecucao | null>(null);

  const tiposPadrao = tipos.filter((t) => t.referenciaTipo !== "PERSONALIZADO");
  const tiposPersonalizados = tipos.filter((t) => t.referenciaTipo === "PERSONALIZADO");
  const tiposDaCategoria = categoria === "PADRAO" ? tiposPadrao : tiposPersonalizados;

  const carregar = () =>
    Promise.all([api.listConstrutorTipos(), api.listConstrutorExecucoes()]).then(([t, e]) => {
      setTipos(t.tipos);
      setExecucoes(e.execucoes);
      if (!tipoSelecionadoId) {
        const primeiroPadrao = t.tipos.find((tipo) => tipo.referenciaTipo !== "PERSONALIZADO");
        const primeiro = primeiroPadrao ?? t.tipos[0];
        if (primeiro) {
          setCategoria(primeiro.referenciaTipo === "PERSONALIZADO" ? "PERSONALIZADO" : "PADRAO");
          setTipoSelecionadoId(primeiro.id);
        }
      }
    });

  function trocarCategoria(nova: Categoria) {
    setCategoria(nova);
    const lista = nova === "PADRAO" ? tiposPadrao : tiposPersonalizados;
    setTipoSelecionadoId(lista[0]?.id ?? "");
  }

  useEffect(() => {
    carregar().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            Nenhum tipo de documento configurado ainda. Peça ao Super Admin para cadastrar um em Parametrizações
            (Construtor de Documentos ou Documentos Personalizados, com um prompt de IA preenchido).
          </p>
        </Card>
      ) : (
        <Card className="mb-6 p-5">
          <span className="mb-1 block text-sm font-medium text-ink">O que você quer montar?</span>

          <div className="mb-3 inline-flex rounded-full border border-border bg-bg p-0.5">
            <button
              type="button"
              onClick={() => trocarCategoria("PADRAO")}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                categoria === "PADRAO" ? "bg-petrol text-white shadow-soft" : "text-ink-muted hover:text-ink"
              }`}
            >
              Padrão ({tiposPadrao.length})
            </button>
            <button
              type="button"
              onClick={() => trocarCategoria("PERSONALIZADO")}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                categoria === "PERSONALIZADO" ? "bg-petrol text-white shadow-soft" : "text-ink-muted hover:text-ink"
              }`}
            >
              Personalizados ({tiposPersonalizados.length})
            </button>
          </div>

          {tiposDaCategoria.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-3 text-sm text-ink-muted">
              {categoria === "PADRAO"
                ? "Nenhum tipo padrão configurado ainda."
                : "Nenhum documento personalizado com IA configurado ainda — peça ao Super Admin para preencher as " +
                  "instruções de IA dele em Parametrizações → Documentos Personalizados."}
            </p>
          ) : (
            <ComboBox
              value={tipoSelecionadoId}
              onChange={setTipoSelecionadoId}
              placeholder="Busque pelo nome do documento…"
              options={tiposDaCategoria.map((t) => ({
                value: t.id,
                label: t.nome,
                sublabel: t.referenciaNome && t.referenciaNome !== t.nome ? `(${t.referenciaNome})` : undefined,
              }))}
            />
          )}

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
              {resultado.status !== "APROVADO" && <Button onClick={() => aprovar(resultado.id)}>Aprovar</Button>}
            </div>
          </div>

          {resultado.tipoDocumento.referenciaTipo === "PORTAL_PREVIDENCIARIO" ? (
            resultado.indicadorSugestoes.length === 0 ? (
              <p className="text-sm text-ink-muted">Nenhum indicador foi encontrado nos documentos enviados.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {resultado.indicadorSugestoes.map((s) => (
                  <IndicadorSugestaoCard key={s.id} sugestao={s} onRevisar={revisarIndicadorSugestao} />
                ))}
              </div>
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
          <h2 className="mb-3 font-display text-lg font-bold text-ink">Histórico</h2>
          <div className="flex flex-col gap-2">
            {execucoes.map((e) => (
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
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function IndicadorSugestaoCard({
  sugestao,
  onRevisar,
}: {
  sugestao: IndicadorSugestao;
  onRevisar: (id: string, status: "APROVADA" | "REJEITADA" | "CORRIGIDA", valorFinal?: string, competenciaFinal?: string) => void;
}) {
  const [valor, setValor] = useState(sugestao.valorFinal ?? sugestao.valorSugerido);
  const [competencia, setCompetencia] = useState(sugestao.competencia.slice(0, 7));
  const decidido = sugestao.status !== "PENDENTE";
  const tipo = sugestao.indicador?.tipo ?? "TEXTO";
  // MOEDA fica como texto livre — <input type="number"> rejeita vírgula decimal (padrão BR) e
  // deixaria o campo parecendo vazio mesmo com um valor sugerido preenchido.
  const inputType = tipo === "NUMERICO" ? "number" : tipo === "DATA" ? "date" : "text";

  function salvar(status: "APROVADA" | "CORRIGIDA") {
    onRevisar(sugestao.id, status, valor, `${competencia}-01`);
  }

  return (
    <div className="rounded-lg bg-ink/5 p-3">
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
            inputMode={tipo === "MOEDA" ? "decimal" : undefined}
            className="mt-0.5 block w-full rounded-lg border border-border bg-surface p-2 text-sm"
            value={valor}
            disabled={decidido}
            onChange={(e) => setValor(e.target.value)}
          />
        </label>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        {sugestao.documentoNomeOrigem}
        {sugestao.paginaOrigem ? `, pág. ${sugestao.paginaOrigem}` : ""}
        {sugestao.trechoOrigem ? `: "${sugestao.trechoOrigem}"` : ""}
      </p>
      {decidido ? (
        <p className="mt-2 text-xs font-medium text-ink-muted">Status: {sugestao.status.toLowerCase()}</p>
      ) : (
        <div className="mt-2 flex gap-2">
          <Button
            onClick={() => salvar(valor === sugestao.valorSugerido && `${competencia}-01` === sugestao.competencia.slice(0, 10) ? "APROVADA" : "CORRIGIDA")}
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
