import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, FolderOpen, Paperclip, Trash2 } from "lucide-react";
import { api, type CriterioDocumento, type CrpCriterion } from "../lib/api";
import { Badge, statusLabel, statusTone } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";

const STATUS_OPCOES = ["REGULAR", "IRREGULAR", "PENDENTE"] as const;

const FORMA_VERIFICACAO_LABEL: Record<string, string> = {
  automatica: "Automática",
  auditoria_direta: "Auditoria direta",
  auditoria_indireta_e_direta: "Auditoria indireta + direta",
  analise_documental: "Análise documental",
  analise_documental_e_auditoria: "Análise documental + auditoria",
};

export function CrpCompliancePage() {
  const [criteria, setCriteria] = useState<CrpCriterion[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string>("Todas");
  const [erro, setErro] = useState<string | null>(null);
  const [documentosAbertos, setDocumentosAbertos] = useState<Set<string>>(new Set());

  const carregar = () =>
    api
      .listCrpCriteria()
      .then((res) => setCriteria(res.criteria))
      .finally(() => setLoading(false));

  useEffect(() => {
    carregar();
  }, []);

  const categories = useMemo(() => ["Todas", ...new Set(criteria.map((c) => c.category))], [criteria]);
  const filtered = category === "Todas" ? criteria : criteria.filter((c) => c.category === category);

  async function mudarStatus(criterionId: string, status: (typeof STATUS_OPCOES)[number]) {
    setErro(null);
    try {
      await api.updateCrpCriterion(criterionId, { status });
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao atualizar status.");
    }
  }

  function alternarDocumentos(code: string) {
    setDocumentosAbertos((prev) => {
      const proximo = new Set(prev);
      if (proximo.has(code)) proximo.delete(code);
      else proximo.add(code);
      return proximo;
    });
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Central de Compliance — CRP</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Os 22 critérios oficiais do Certificado de Regularidade Previdenciária, monitorados em um só lugar.
            Documentação e evidências de cada critério ficam organizadas aqui — independente dos documentos do
            Pró-Gestão, que vivem em "Pró-Gestão RPPS" e "Documentos".
          </p>
        </div>
        <Link
          to="/crp/documentos"
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-ink shadow-soft hover:bg-ink/5"
        >
          <FolderOpen size={15} /> Ver todos os documentos
        </Link>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              category === cat
                ? "border-petrol bg-petrol/10 text-petrol"
                : "border-border text-ink-muted hover:bg-ink/5"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-ink-muted">Carregando critérios…</p>}
      {erro && <p className="mb-3 text-sm text-crit">{erro}</p>}

      <div className="flex flex-col gap-3">
        {filtered.map((criterion) => {
          const tenantStatus = criterion.tenantStatuses[0];
          const documentosVisiveis = documentosAbertos.has(criterion.code);

          return (
            <Card key={criterion.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs text-ink-muted">{criterion.code}</p>
                  <h3 className="mt-0.5 font-medium text-ink">{criterion.title}</h3>
                  <p className="mt-1 max-w-2xl text-sm text-ink-muted">{criterion.description}</p>
                  {criterion.dependsOn && (
                    <p className="mt-1 text-xs text-ink-muted">
                      Depende de: <span className="font-medium">{criterion.dependsOn.title}</span>
                      {criterion.cascadeBlocked && (
                        <span className="ml-1 text-crit">— bloqueado porque a fonte não está regular</span>
                      )}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge tone={statusTone(criterion.effectiveStatus)}>{statusLabel(criterion.effectiveStatus)}</Badge>
                  <select
                    className="rounded-lg border border-border bg-bg px-2 py-1 text-xs text-ink"
                    value={tenantStatus?.status ?? "PENDENTE"}
                    onChange={(e) => mudarStatus(criterion.id, e.target.value as (typeof STATUS_OPCOES)[number])}
                  >
                    {STATUS_OPCOES.map((s) => (
                      <option key={s} value={s}>
                        {statusLabel(s)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2 border-t border-border pt-4 text-xs text-ink-muted sm:grid-cols-2 lg:grid-cols-4">
                <p>
                  <span className="font-medium text-ink">Periodicidade:</span> {criterion.periodicity}
                </p>
                <p>
                  <span className="font-medium text-ink">Próximo vencimento:</span>{" "}
                  {tenantStatus?.nextDueAt ? new Date(tenantStatus.nextDueAt).toLocaleDateString("pt-BR") : "—"}
                </p>
                <p>
                  <span className="font-medium text-ink">Verificação:</span>{" "}
                  {FORMA_VERIFICACAO_LABEL[criterion.formaVerificacao] ?? criterion.formaVerificacao}
                  {criterion.sistemaOrigem && criterion.sistemaOrigem !== "nenhum" ? ` (${criterion.sistemaOrigem})` : ""}
                </p>
                <p className="lg:col-span-1">
                  <span className="font-medium text-ink">Base normativa:</span> {criterion.legalBasis}
                </p>
              </div>

              <div className="mt-3 border-t border-border pt-3">
                <button
                  onClick={() => alternarDocumentos(criterion.code)}
                  className="flex items-center gap-1.5 text-xs font-medium text-petrol hover:underline"
                >
                  <Paperclip size={13} />
                  {documentosVisiveis ? "Ocultar documentos" : "Ver documentos / evidências"}
                </button>
                {documentosVisiveis && <CriterioDocumentosSection criterionCode={criterion.code} />}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function CriterioDocumentosSection({ criterionCode }: { criterionCode: string }) {
  const [documentos, setDocumentos] = useState<CriterioDocumento[]>([]);
  const [descricao, setDescricao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = () => api.listUploadsCriterio(criterionCode).then((res) => setDocumentos(res.documentos));

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [criterionCode]);

  async function enviar(file: File) {
    setEnviando(true);
    setErro(null);
    try {
      await api.uploadPdfCriterio(criterionCode, file, descricao || undefined);
      setDescricao("");
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao enviar documento.");
    } finally {
      setEnviando(false);
    }
  }

  async function excluir(id: string) {
    await api.deleteUpload(id);
    await carregar();
  }

  return (
    <div className="mt-3 rounded-lg bg-ink/5 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block flex-1 text-xs">
          <span className="mb-1 block font-medium text-ink">Descrição (opcional)</span>
          <input
            type="text"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder='Ex.: "DAIR de março/2026"'
            className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-petrol"
          />
        </label>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-gradient-to-r from-cyan-600 to-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-soft hover:brightness-110">
          <Paperclip size={13} />
          {enviando ? "Enviando…" : "Anexar PDF"}
          <input
            type="file"
            accept="application/pdf"
            disabled={enviando}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) enviar(file);
            }}
          />
        </label>
      </div>
      {erro && <p className="mt-2 text-xs text-crit">{erro}</p>}

      <div className="mt-3 flex flex-col gap-1.5">
        {documentos.map((d) => (
          <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2 text-xs">
            <div className="flex items-center gap-2 text-ink">
              <FileText size={14} className="shrink-0 text-ink-muted" />
              <div>
                <p className="font-medium">{d.nomeArquivo}</p>
                {d.descricao && <p className="text-ink-muted">{d.descricao}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2 text-ink-muted">
              <span>{new Date(d.createdAt).toLocaleDateString("pt-BR")}</span>
              <button onClick={() => excluir(d.id)} className="text-crit hover:text-crit/80" title="Excluir">
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
        {documentos.length === 0 && <p className="text-xs text-ink-muted">Nenhum documento anexado ainda.</p>}
      </div>
    </div>
  );
}
