import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Download, Printer } from "lucide-react";
import { api, type PortalIndicadoresPublico, type PortalPrevidenciario } from "../lib/api";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { PortalPrevidenciarioLayout } from "../components/layout/PortalPrevidenciarioLayout";
import { DocumentoIndicadoresCard, baixarCsv } from "../components/portal-previdenciario/DocumentoIndicadoresCard";

// Conteúdo central do Portal Previdenciário: filtro por documento/período + gráfico (indicadores
// numéricos/moeda) ou tabela (texto/data) dos valores já lançados pelo RPPS (manual ou aprovados
// via Construtor de Documentos) — ver GET /public/portal-previdenciario/:slug/indicadores.
function IndicadoresRelatorio({ slug }: { slug: string }) {
  const [dados, setDados] = useState<PortalIndicadoresPublico | null>(null);
  const [documentoId, setDocumentoId] = useState<string>("todos");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");

  useEffect(() => {
    api.portalPrevidenciarioIndicadores(slug).then(setDados).catch(() => setDados({ documentos: [] }));
  }, [slug]);

  const documentosFiltrados = useMemo(() => {
    if (!dados) return [];
    const porDocumento = documentoId === "todos" ? dados.documentos : dados.documentos.filter((d) => d.id === documentoId);
    return porDocumento.map((doc) => ({
      ...doc,
      indicadores: doc.indicadores.map((ind) => ({
        ...ind,
        valores: ind.valores.filter((v) => {
          const competencia = v.competencia.slice(0, 7);
          if (inicio && competencia < inicio) return false;
          if (fim && competencia > fim) return false;
          return true;
        }),
      })),
    }));
  }, [dados, documentoId, inicio, fim]);

  if (!dados) return <p className="text-sm text-ink-muted">Carregando indicadores…</p>;

  if (dados.documentos.length === 0) {
    return (
      <Card className="mt-8 p-6">
        <p className="text-sm text-ink-muted">Nenhum indicador foi lançado ainda para este RPPS.</p>
      </Card>
    );
  }

  return (
    <div className="mt-8">
      <Card className="mb-4 flex flex-wrap items-end gap-4 p-4">
        <label className="text-xs text-ink-muted">
          Documento
          <select
            className="mt-1 block rounded-lg border border-border bg-surface p-2 text-sm"
            value={documentoId}
            onChange={(e) => setDocumentoId(e.target.value)}
          >
            <option value="todos">Todos</option>
            {dados.documentos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-ink-muted">
          De
          <input
            type="month"
            className="mt-1 block rounded-lg border border-border bg-surface p-2 text-sm"
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
          />
        </label>
        <label className="text-xs text-ink-muted">
          Até
          <input
            type="month"
            className="mt-1 block rounded-lg border border-border bg-surface p-2 text-sm"
            value={fim}
            onChange={(e) => setFim(e.target.value)}
          />
        </label>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={() => baixarCsv(`indicadores-${slug}.csv`, documentosFiltrados)}>
            <Download size={14} /> Exportar CSV
          </Button>
          <Button variant="ghost" onClick={() => window.print()}>
            <Printer size={14} /> Imprimir
          </Button>
        </div>
      </Card>

      <div className="flex flex-col gap-6">
        {documentosFiltrados.map((doc) => (
          <DocumentoIndicadoresCard key={doc.id} documento={doc} />
        ))}
      </div>
    </div>
  );
}

// Página pública (sem autenticação) do Portal Previdenciário — módulo novo, distinto do Portal
// de Transparência (/transparencia/:slug). Menu e rodapé vêm ao vivo das APIs externas
// configuradas pra este RPPS; o conteúdo central mostra os indicadores já lançados (manual ou
// via Construtor de Documentos), com filtro por documento/período e gráfico/tabela.
export function PortalPrevidenciarioPage() {
  const { slug } = useParams<{ slug: string }>();
  const [dados, setDados] = useState<PortalPrevidenciario | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    api
      .portalPrevidenciario(slug)
      .then(setDados)
      .catch((err) => setErro(err instanceof Error ? err.message : "Erro ao carregar o Portal Previdenciário."));
  }, [slug]);

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
      <div className="mx-auto max-w-5xl">
        <h1 className="font-display text-2xl font-bold text-ink">{dados?.tenant.name ?? "Carregando…"}</h1>
        {dados && <p className="mt-1 text-sm text-ink-muted">{dados.tenant.federatedEntity}</p>}

        {slug && <IndicadoresRelatorio slug={slug} />}
      </div>
    </PortalPrevidenciarioLayout>
  );
}
