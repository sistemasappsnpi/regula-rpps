import { useCallback, useEffect, useState } from "react";
import { Lock } from "lucide-react";
import {
  api,
  type Auditoria,
  type DocumentoComposto,
  type FonteReadiness,
  type Nivel,
  type ProGestaoAcao,
  type ProGestaoResumo,
  type Upload,
} from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { Badge } from "../components/ui/Badge";
import { Card, StatTile } from "../components/ui/Card";
import { Button } from "../components/ui/Button";

const NIVEIS: Nivel[] = ["I", "II", "III", "IV"];
const NIVEL_INDEX: Record<Nivel, number> = { I: 0, II: 1, III: 2, IV: 3 };

function nivelAlcanca(campoNivel: Nivel, selecionado: Nivel): boolean {
  return NIVEL_INDEX[campoNivel] <= NIVEL_INDEX[selecionado];
}

function compostoTone(status: DocumentoComposto["status"]) {
  if (status === "APROVADO") return "ok" as const;
  if (status === "DESATUALIZADO") return "crit" as const;
  return "warn" as const;
}

const DIMENSOES = ["Controles Internos", "Governança Corporativa", "Educação Previdenciária"] as const;

// Ações com dado real de demonstração já carregado no seed — abertas por padrão para quem
// está explorando o sistema pela primeira vez; as demais 22 ficam recolhidas (mesmo motor,
// só ainda não preenchidas por nenhum tenant real).
const EXPANDIR_POR_PADRAO = new Set(["codigo-etica", "transparencia"]);

export function ProGestaoPage() {
  const { tenant } = useAuth();
  const [acoes, setAcoes] = useState<ProGestaoAcao[]>([]);
  const [resumo, setResumo] = useState<ProGestaoResumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set(EXPANDIR_POR_PADRAO));

  const carregar = useCallback(async () => {
    const [acoesRes, resumoRes] = await Promise.all([api.listProGestaoAcoes(), api.proGestaoResumo()]);
    setAcoes(acoesRes.acoes);
    setResumo(resumoRes);
  }, []);

  useEffect(() => {
    carregar().finally(() => setLoading(false));
  }, [carregar]);

  function alternar(codigo: string) {
    setExpandidas((prev) => {
      const proximo = new Set(prev);
      if (proximo.has(codigo)) proximo.delete(codigo);
      else proximo.add(codigo);
      return proximo;
    });
  }

  if (loading) return <p className="text-sm text-ink-muted">Carregando…</p>;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink">Pró-Gestão RPPS</h1>
        <p className="mt-1 text-sm text-ink-muted">
          As 24 ações do programa, organizadas por dimensão. Cada ação tem seu formulário dinâmico por nível de
          aderência e, quando compõe dado de outras ações, seu próprio motor de dependências.
        </p>
      </header>

      {resumo && (
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {resumo.porDimensao.map((d) => (
            <StatTile
              key={d.dimensao}
              label={d.dimensao}
              value={`${d.acoesComNivelAlcancado}/${d.totalAcoes}`}
              hint="ações com nível de aderência já registrado"
            />
          ))}
        </div>
      )}

      {resumo && (
        <Card className="mb-8 p-5">
          <p className="mb-3 text-sm font-medium text-ink">Faltam para cada nível de certificação</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {NIVEIS.map((n) => (
              <div key={n} className="rounded-lg border border-border p-3 text-center">
                <p className="text-xs uppercase tracking-wide text-ink-muted">Nível {n}</p>
                <p className="mt-1 font-display text-xl font-semibold">{resumo.faltamPorNivel[n]}</p>
                <p className="text-xs text-ink-muted">de {resumo.metas[n]} ações</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {DIMENSOES.map((dimensao) => {
        const dasDimensao = acoes.filter((a) => a.dimensao === dimensao);
        if (dasDimensao.length === 0) return null;

        return (
          <section key={dimensao} className="mb-8">
            <h2 className="mb-3 font-display text-lg font-semibold text-ink">{dimensao}</h2>
            <div className="flex flex-col gap-3">
              {dasDimensao.map((acao) => (
                <AcaoAccordionItem
                  key={acao.codigo}
                  acao={acao}
                  expandida={expandidas.has(acao.codigo)}
                  onToggle={() => alternar(acao.codigo)}
                  onChanged={carregar}
                  tenantSlug={tenant?.slug}
                />
              ))}
            </div>
          </section>
        );
      })}

      <AuditoriaSection />
    </div>
  );
}

function AcaoAccordionItem({
  acao,
  expandida,
  onToggle,
  onChanged,
  tenantSlug,
}: {
  acao: ProGestaoAcao;
  expandida: boolean;
  onToggle: () => void;
  onChanged: () => void;
  tenantSlug?: string;
}) {
  const { hasFeature } = useAuth();

  return (
    <Card className="overflow-hidden">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-ink/5"
      >
        <div className="min-w-0">
          <span className="font-mono text-xs text-ink-muted">{acao.numero}</span>{" "}
          <span className="text-sm text-ink">{acao.nome}</span>
          {acao.essencial && (
            <span className="ml-2 rounded-full border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gold">
              essencial
            </span>
          )}
          {acao.dependeDe.length > 0 && (
            <span className="ml-2 text-[10px] uppercase tracking-wide text-ink-muted">
              documento composto · {acao.dependeDe.length} fonte{acao.dependeDe.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={acao.nivelAtual ? "ok" : "neutral"}>{acao.nivelAtual ? `Nível ${acao.nivelAtual}` : "Não iniciado"}</Badge>
          <span className="text-ink-muted">{expandida ? "▲" : "▼"}</span>
        </div>
      </button>

      {expandida && (
        <div className="border-t border-border p-4">
          <AcaoFonteForm acao={acao} onChanged={onChanged} />
          {acao.dependeDe.length > 0 && (
            <div className="mt-4">
              {hasFeature("pro_gestao_dependencias") ? (
                <DocumentoCompostoSection acao={acao} tenantSlug={tenantSlug} onChanged={onChanged} />
              ) : (
                <RecursoBloqueado nome="Motor de dependências entre documentos" />
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// -----------------------------------------------------------------------------------------
// Motor de preenchimento: formulário dinâmico por nível (nunca esconde campo de nível
// inferior) + upload de PDF com extração assistida, aprovada campo a campo.
// -----------------------------------------------------------------------------------------
function AcaoFonteForm({ acao, onChanged }: { acao: ProGestaoAcao; onChanged: () => void }) {
  const { hasFeature } = useAuth();
  const iaHabilitada = hasFeature("pro_gestao_ia_extracao");
  const [nivelSelecionado, setNivelSelecionado] = useState<Nivel>(acao.nivelAtual ?? "I");
  const [rascunhos, setRascunhos] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [avisoSalvar, setAvisoSalvar] = useState<string | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [enviandoPdf, setEnviandoPdf] = useState(false);
  const [avisoIa, setAvisoIa] = useState<string | null>(null);

  const carregarUploads = useCallback(async () => {
    const res = await api.listUploads(acao.codigo);
    setUploads(res.uploads);
  }, [acao.codigo]);

  useEffect(() => {
    if (iaHabilitada) carregarUploads();
  }, [carregarUploads, iaHabilitada]);

  const camposVisiveis = acao.campos.filter((c) => nivelAlcanca(c.nivelMinimo, nivelSelecionado));

  async function mudarNivel(n: Nivel) {
    setNivelSelecionado(n);
    await api.setNivelAtual(acao.codigo, n);
    onChanged();
  }

  // Igual ao formulário de DocumentoDetalhePage.tsx: nenhum campo é obrigatório nem salva
  // sozinho — um único "Salvar" no final grava de uma vez só o que foi tocado nesta sessão.
  async function salvarTudo() {
    const alterados = camposVisiveis.filter((campo) => {
      const rascunho = rascunhos[campo.id];
      return rascunho !== undefined && rascunho.trim() !== "" && rascunho !== (campo.valorAtual?.valor ?? "");
    });
    if (alterados.length === 0) return;

    setSalvando(true);
    setAvisoSalvar(null);
    try {
      for (const campo of alterados) {
        await api.setCampoValor(campo.id, rascunhos[campo.id]);
      }
      setRascunhos({});
      onChanged();
    } catch (err) {
      setAvisoSalvar(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function enviarPdf(file: File) {
    setEnviandoPdf(true);
    setAvisoIa(null);
    try {
      const resultado = await api.uploadPdf(acao.codigo, file);
      if (!resultado.aiConfigured) {
        setAvisoIa(
          "PDF salvo e texto extraído, mas nenhuma sugestão automática foi gerada porque a chave da Anthropic API " +
            "não está configurada no servidor (ANTHROPIC_API_KEY). Preencha os campos manualmente abaixo.",
        );
      } else if (resultado.sugestoes.length === 0) {
        setAvisoIa("A IA não encontrou valores para os campos desta ação neste PDF.");
      }
      await carregarUploads();
    } catch (err) {
      setAvisoIa(err instanceof Error ? err.message : "Erro ao enviar PDF.");
    } finally {
      setEnviandoPdf(false);
    }
  }

  async function revisarSugestao(sugestaoId: string, status: "APROVADA" | "REJEITADA" | "CORRIGIDA", valorFinal?: string) {
    await api.revisarSugestao(sugestaoId, status, valorFinal);
    await carregarUploads();
    onChanged();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-ink-muted">{acao.objetivo}</p>
        <div className="flex gap-1">
          {NIVEIS.map((n) => (
            <button
              key={n}
              onClick={() => mudarNivel(n)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                nivelSelecionado === n ? "border-petrol bg-petrol/10 text-petrol" : "border-border text-ink-muted hover:bg-ink/5"
              }`}
            >
              Nível {n}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-3 text-xs text-ink-muted">
        Todos os campos são opcionais e independentes — preencha o que já tiver em mãos, na ordem que quiser, e
        clique em "Salvar" no final para gravar tudo de uma vez.
      </p>

      <div className="mb-4 flex flex-col gap-4">
        {camposVisiveis.map((campo) => (
          <div key={campo.id} className="rounded-lg border border-border p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-ink">{campo.descricao}</p>
              <div className="flex items-center gap-2">
                <Badge tone="neutral">Nível mínimo {campo.nivelMinimo}</Badge>
                {campo.valorAtual && (
                  <Badge tone={campo.valorAtual.origem === "MANUAL" ? "neutral" : "ok"}>
                    {campo.valorAtual.origem === "MANUAL" ? "preenchido manualmente" : "extraído de PDF"}
                  </Badge>
                )}
              </div>
            </div>

            <textarea
              className="w-full rounded-lg border border-border bg-bg p-2 text-sm text-ink"
              rows={2}
              defaultValue={campo.valorAtual?.valor ?? ""}
              placeholder="Opcional — preencha manualmente ou envie um PDF abaixo para extração assistida…"
              onChange={(e) => setRascunhos((prev) => ({ ...prev, [campo.id]: e.target.value }))}
            />
            {campo.valorAtual?.origemDetalhe && (
              <p className="mt-1 text-xs text-ink-muted">Origem: {campo.valorAtual.origemDetalhe}</p>
            )}
          </div>
        ))}
      </div>

      {camposVisiveis.length > 0 && (
        <div className="mb-4 flex items-center justify-end gap-3">
          {avisoSalvar && <p className="text-xs text-crit">{avisoSalvar}</p>}
          <Button onClick={salvarTudo} disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      )}

      <div className="border-t border-border pt-4">
        {iaHabilitada ? (
          <>
            <p className="mb-2 text-sm font-medium text-ink">Upload de PDF existente (extração assistida por IA)</p>
            <input
              type="file"
              accept="application/pdf"
              disabled={enviandoPdf}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) enviarPdf(file);
              }}
              className="text-sm text-ink-muted"
            />
            {enviandoPdf && <p className="mt-2 text-xs text-ink-muted">Enviando e extraindo texto do PDF…</p>}
            {avisoIa && <p className="mt-2 text-xs text-ink-muted">{avisoIa}</p>}

            {uploads.map((upload) => (
              <div key={upload.id} className="mt-3 rounded-lg border border-border p-3">
                <p className="text-xs font-medium text-ink">{upload.nomeArquivo}</p>
                {upload.sugestoes.length === 0 && (
                  <p className="mt-1 text-xs text-ink-muted">Nenhuma sugestão de preenchimento para este arquivo.</p>
                )}
                <div className="mt-2 flex flex-col gap-3">
                  {upload.sugestoes.map((s) => (
                    <SugestaoCard key={s.id} sugestao={s} onRevisar={revisarSugestao} />
                  ))}
                </div>
              </div>
            ))}
          </>
        ) : (
          <RecursoBloqueado nome="Extração de PDF por IA" />
        )}
      </div>
    </div>
  );
}

function RecursoBloqueado({ nome }: { nome: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-3 text-xs text-ink-muted">
      <Lock size={13} />
      <span>
        <span className="font-medium text-ink">{nome}</span> não está incluído no plano contratado pelo seu RPPS.
      </span>
    </div>
  );
}

function SugestaoCard({
  sugestao,
  onRevisar,
}: {
  sugestao: Upload["sugestoes"][number];
  onRevisar: (id: string, status: "APROVADA" | "REJEITADA" | "CORRIGIDA", valorFinal?: string) => void;
}) {
  const [valor, setValor] = useState(sugestao.valorFinal ?? sugestao.valorSugerido);
  const decidido = sugestao.status !== "PENDENTE";

  return (
    <div className="rounded-lg bg-ink/5 p-3">
      <textarea
        className="w-full rounded-lg border border-border bg-surface p-2 text-sm"
        rows={2}
        value={valor}
        disabled={decidido}
        onChange={(e) => setValor(e.target.value)}
      />
      {sugestao.paginaOrigem && (
        <p className="mt-1 text-xs text-ink-muted">
          Página {sugestao.paginaOrigem}
          {sugestao.trechoOrigem ? `: "${sugestao.trechoOrigem}"` : ""}
        </p>
      )}
      {decidido ? (
        <p className="mt-2 text-xs font-medium text-ink-muted">Status: {sugestao.status.toLowerCase()}</p>
      ) : (
        <div className="mt-2 flex gap-2">
          <Button onClick={() => onRevisar(sugestao.id, valor === sugestao.valorSugerido ? "APROVADA" : "CORRIGIDA", valor)}>
            Aprovar este campo
          </Button>
          <Button variant="ghost" onClick={() => onRevisar(sugestao.id, "REJEITADA")}>
            Rejeitar
          </Button>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------------------
// Motor de dependências: prontidão das fontes, geração de rascunho citando origem, aprovação
// humana explícita e detecção de desatualização.
// -----------------------------------------------------------------------------------------
function DocumentoCompostoSection({
  acao,
  tenantSlug,
  onChanged,
}: {
  acao: ProGestaoAcao;
  tenantSlug?: string;
  onChanged: () => void;
}) {
  const [prontidao, setProntidao] = useState<FonteReadiness[]>([]);
  const [composto, setComposto] = useState<DocumentoComposto | null>(null);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const [prontidaoRes, compostoRes] = await Promise.all([
      api.prontidaoDeFontes(acao.codigo),
      api.getDocumentoComposto(acao.codigo),
    ]);
    setProntidao(prontidaoRes.prontidao);
    setComposto(compostoRes.composto);
  }, [acao.codigo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function gerar() {
    setGerando(true);
    setErro(null);
    try {
      const resultado = await api.gerarRascunho(acao.codigo);
      setComposto(resultado.composto ? { ...resultado.composto, conteudo: resultado.itens } : null);
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao gerar rascunho.");
    } finally {
      setGerando(false);
    }
  }

  async function aprovar() {
    await api.aprovarRascunho(acao.codigo);
    await carregar();
    onChanged();
  }

  const algumaFontePronta = prontidao.some((f) => f.satisfeita);

  return (
    <div className="border-t border-border pt-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-ink">Documento composto — motor de dependências</p>
        {composto && <Badge tone={compostoTone(composto.status)}>{composto.status}</Badge>}
      </div>

      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">Documentos-fonte</p>
      <div className="mb-4 flex flex-col gap-2">
        {prontidao.map((f) => (
          <div key={f.fonteCodigo} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
            <div>
              <p className="text-ink">{f.fonteNome}</p>
              <p className="text-xs text-ink-muted">
                {f.tipoRelacao === "citacao_explicita_no_manual" ? "citação explícita no Manual" : "dependência inferida por sobreposição de conteúdo"}
              </p>
              {!f.satisfeita && f.camposFaltando.length > 0 && (
                <p className="mt-1 text-xs text-ink-muted">Faltando: {f.camposFaltando.join("; ")}</p>
              )}
            </div>
            <Badge tone={f.satisfeita ? "ok" : "neutral"}>{f.satisfeita ? "pronta" : "pendente"}</Badge>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Button onClick={gerar} disabled={!algumaFontePronta || gerando}>
          {composto ? "Regenerar rascunho" : "Gerar rascunho"}
        </Button>
        {composto && composto.status !== "APROVADO" && <Button onClick={aprovar}>Aprovar e publicar</Button>}
        {acao.codigo === "transparencia" && tenantSlug && composto?.status === "APROVADO" && (
          <a
            href={`/transparencia/${tenantSlug}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-petrol hover:underline"
          >
            Ver página pública →
          </a>
        )}
      </div>
      {erro && <p className="mt-2 text-xs text-crit">{erro}</p>}

      {composto && (
        <div className="mt-4 flex flex-col gap-2">
          {composto.conteudo.map((item, i) => (
            <div key={i} className="rounded-lg bg-ink/5 p-3 text-sm">
              <p className="text-ink">{item.valor}</p>
              <p className="mt-1 text-xs text-ink-muted">
                Fonte: {item.fonteAcaoCodigo} · {item.fonteCampoId}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AuditoriaSection() {
  const [auditoria, setAuditoria] = useState<Auditoria | null>(null);

  useEffect(() => {
    api.auditoria().then(setAuditoria);
  }, []);

  if (!auditoria) return null;

  const eventos = [
    ...auditoria.campoValores.map((v) => ({
      quando: v.createdAt,
      texto: `${v.criadoPor?.name ?? "—"} preencheu "${v.campo.descricao}" (${v.campo.acao.nome}) — origem: ${v.origem.toLowerCase()}`,
    })),
    ...auditoria.uploads.map((u) => ({
      quando: u.createdAt,
      texto: `${u.uploadedBy.name} enviou o PDF "${u.nomeArquivo}"`,
    })),
    ...auditoria.compostos.map((c) => ({
      quando: c.geradoEm,
      texto: `Documento composto "${c.acaoCodigo}" — status atual: ${c.status.toLowerCase()}`,
    })),
  ].sort((a, b) => new Date(b.quando).getTime() - new Date(a.quando).getTime());

  return (
    <Card className="p-5">
      <p className="mb-3 text-sm font-medium text-ink">Trilha de auditoria</p>
      <div className="flex flex-col gap-2 text-xs text-ink-muted">
        {eventos.slice(0, 20).map((e, i) => (
          <p key={i}>
            <span className="font-mono">{new Date(e.quando).toLocaleString("pt-BR")}</span> — {e.texto}
          </p>
        ))}
        {eventos.length === 0 && <p>Nenhum evento registrado ainda.</p>}
      </div>
    </Card>
  );
}
