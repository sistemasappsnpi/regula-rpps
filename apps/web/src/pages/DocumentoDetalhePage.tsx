import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, ExternalLink, FileText, Lock, Trash2 } from "lucide-react";
import { api, type Nivel, type ProGestaoAcao, type Upload } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";

const NIVEL_INDEX: Record<Nivel, number> = { I: 0, II: 1, III: 2, IV: 3 };
function nivelAlcanca(campoNivel: Nivel, selecionado: Nivel): boolean {
  return NIVEL_INDEX[campoNivel] <= NIVEL_INDEX[selecionado];
}

// Página dedicada a um único documento/ação do Pró-Gestão: preenchimento manual, upload de
// PDF com extração por IA, lista do que já foi enviado, e link para onde isso aparece no
// Portal público. Os campos exibidos são definidos pelo nível que o Admin Global configurou
// para este RPPS (Tenant.nivelProGestaoAlvo) — não há mais seletor de nível aqui.
export function DocumentoDetalhePage() {
  const { acaoCodigo } = useParams<{ acaoCodigo: string }>();
  const { tenant, hasFeature } = useAuth();
  const iaHabilitada = hasFeature("pro_gestao_ia_extracao");

  const [acao, setAcao] = useState<ProGestaoAcao | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [loading, setLoading] = useState(true);
  const [rascunhos, setRascunhos] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [avisoSalvar, setAvisoSalvar] = useState<string | null>(null);
  const [enviandoPdf, setEnviandoPdf] = useState(false);
  const [avisoIa, setAvisoIa] = useState<string | null>(null);

  const carregarUploads = useCallback(async () => {
    if (!acaoCodigo || !iaHabilitada) return;
    const res = await api.listUploads(acaoCodigo);
    setUploads(res.uploads);
  }, [acaoCodigo, iaHabilitada]);

  const carregar = useCallback(async () => {
    if (!acaoCodigo) return;
    const res = await api.listProGestaoAcoes();
    setAcao(res.acoes.find((a) => a.codigo === acaoCodigo) ?? null);
    await carregarUploads();
  }, [acaoCodigo, carregarUploads]);

  useEffect(() => {
    carregar().finally(() => setLoading(false));
  }, [carregar]);

  if (loading) return <p className="text-sm text-ink-muted">Carregando…</p>;
  if (!acao) return <p className="text-sm text-crit">Documento não encontrado.</p>;

  const nivelAlvo: Nivel = tenant?.nivelProGestaoAlvo ?? "I";
  const camposVisiveis = acao.campos.filter((c) => nivelAlcanca(c.nivelMinimo, nivelAlvo));

  // Nenhum campo é obrigatório nem salva sozinho: o usuário preenche o que já tem em mãos, na
  // ordem que quiser, e um único "Salvar" no final grava de uma vez só o que foi tocado nesta
  // sessão — evita interromper o preenchimento com um clique por campo.
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
      await carregar();
    } catch (err) {
      setAvisoSalvar(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function enviarPdf(file: File) {
    if (!acaoCodigo) return;
    setEnviandoPdf(true);
    setAvisoIa(null);
    try {
      const resultado = await api.uploadPdf(acaoCodigo, file);
      if (!resultado.aiConfigured) {
        setAvisoIa(
          "PDF salvo e texto extraído, mas nenhuma sugestão automática foi gerada porque a chave da Anthropic API " +
            "não está configurada no servidor. Preencha os campos manualmente acima.",
        );
      } else if (resultado.sugestoes.length === 0) {
        setAvisoIa("A IA não encontrou valores para os campos deste documento neste PDF.");
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
    await carregar();
  }

  async function excluirUpload(id: string) {
    await api.deleteUpload(id);
    await carregarUploads();
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/documentos" className="mb-4 flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft size={15} /> Voltar para Documentos
      </Link>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-ink-muted">{acao.numero}</p>
          <h1 className="mt-0.5 font-display text-2xl font-bold text-ink">{acao.nome}</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">{acao.objetivo}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge tone="ok">Nível alvo: {nivelAlvo}</Badge>
          {tenant?.slug && (
            <a
              href={`/transparencia/${tenant.slug}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-xs font-medium text-petrol hover:underline"
            >
              Ver no Portal <ExternalLink size={12} />
            </a>
          )}
        </div>
      </header>

      <Card className="mb-6 p-5">
        <p className="mb-1 text-sm font-medium text-ink">Preenchimento manual</p>
        <p className="mb-3 text-xs text-ink-muted">
          Todos os campos são opcionais e independentes — preencha o que já tiver em mãos, na ordem que quiser, e
          clique em "Salvar" no final para gravar tudo de uma vez.
        </p>
        <div className="flex flex-col gap-4">
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
          {camposVisiveis.length === 0 && (
            <p className="text-sm text-ink-muted">Nenhum campo exigido até o nível {nivelAlvo}.</p>
          )}
        </div>
        {camposVisiveis.length > 0 && (
          <div className="mt-4 flex items-center justify-end gap-3 border-t border-border pt-4">
            {avisoSalvar && <p className="text-xs text-crit">{avisoSalvar}</p>}
            <Button onClick={salvarTudo} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <p className="mb-3 text-sm font-medium text-ink">Upload de PDF existente (extração assistida por IA)</p>
        {iaHabilitada ? (
          <>
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

            <p className="mb-2 mt-4 text-xs font-medium uppercase tracking-wide text-ink-muted">
              Documentos já enviados
            </p>
            <div className="flex flex-col gap-3">
              {uploads.map((upload) => (
                <div key={upload.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-ink">
                      <FileText size={13} className="text-ink-muted" /> {upload.nomeArquivo}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-ink-muted">
                      <span>{new Date(upload.createdAt).toLocaleDateString("pt-BR")}</span>
                      <button onClick={() => excluirUpload(upload.id)} className="text-crit hover:text-crit/80" title="Excluir">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
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
              {uploads.length === 0 && <p className="text-xs text-ink-muted">Nenhum documento enviado ainda.</p>}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-3 text-xs text-ink-muted">
            <Lock size={13} />
            <span>
              <span className="font-medium text-ink">Extração de PDF por IA</span> não está incluída no plano
              contratado pelo seu RPPS.
            </span>
          </div>
        )}
      </Card>
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
