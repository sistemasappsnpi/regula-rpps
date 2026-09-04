import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, FileText, Search, Trash2 } from "lucide-react";
import { api, type CriterioDocumento, type CrpCriterion } from "../lib/api";
import { Card } from "../components/ui/Card";

// Visão consolidada de todas as evidências anexadas aos 22 critérios do CRP — "ver todos os
// documentos" a partir de qualquer critério na Central de Compliance CRP.
export function CrpDocumentosPage() {
  const [criterios, setCriterios] = useState<CrpCriterion[]>([]);
  const [documentos, setDocumentos] = useState<(CriterioDocumento & { criterionCode: string })[]>([]);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);

  const carregar = () =>
    Promise.all([api.listCrpCriteria(), api.listUploadsCriterioTodos()]).then(([c, d]) => {
      setCriterios(c.criteria);
      setDocumentos(d.documentos);
    });

  useEffect(() => {
    carregar().finally(() => setLoading(false));
  }, []);

  const tituloPorCodigo = useMemo(() => new Map(criterios.map((c) => [c.code, c.title])), [criterios]);

  const filtrados = documentos.filter((d) => {
    if (!busca.trim()) return true;
    const alvo = `${d.nomeArquivo} ${d.descricao ?? ""} ${tituloPorCodigo.get(d.criterionCode) ?? ""}`.toLowerCase();
    return alvo.includes(busca.toLowerCase());
  });

  async function excluir(id: string) {
    await api.deleteUpload(id);
    await carregar();
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/crp" className="mb-4 flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft size={15} /> Voltar para Compliance CRP
      </Link>

      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink">Documentos do CRP</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Todas as evidências já anexadas, de todos os 22 critérios, em um só lugar. Para anexar um novo
          documento, abra o critério específico na Central de Compliance CRP.
        </p>
      </header>

      <div className="relative mb-4 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por arquivo, critério ou descrição…"
          className="w-full rounded-full border border-border bg-surface py-2 pl-9 pr-3 text-sm outline-none focus:border-petrol"
        />
      </div>

      {loading && <p className="text-sm text-ink-muted">Carregando…</p>}

      <div className="flex flex-col gap-2">
        {filtrados.map((d) => (
          <Card key={d.id} className="flex items-center justify-between gap-3 p-4">
            <div className="flex min-w-0 items-center gap-2">
              <FileText size={16} className="shrink-0 text-ink-muted" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{d.nomeArquivo}</p>
                <p className="truncate text-xs text-ink-muted">
                  {tituloPorCodigo.get(d.criterionCode) ?? d.criterionCode}
                  {d.descricao ? ` · ${d.descricao}` : ""}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3 text-xs text-ink-muted">
              <span>{new Date(d.createdAt).toLocaleDateString("pt-BR")}</span>
              <button onClick={() => excluir(d.id)} className="text-crit hover:text-crit/80" title="Excluir">
                <Trash2 size={14} />
              </button>
            </div>
          </Card>
        ))}
        {!loading && filtrados.length === 0 && (
          <p className="text-sm text-ink-muted">Nenhum documento encontrado.</p>
        )}
      </div>
    </div>
  );
}
