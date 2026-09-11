import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Download, Printer } from "lucide-react";
import { api, type PortalDocumentoPublicoDetalhe, type PortalPrevidenciario } from "../lib/api";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { PortalPrevidenciarioLayout } from "../components/layout/PortalPrevidenciarioLayout";
import { DocumentoIndicadoresCard, baixarCsv } from "../components/portal-previdenciario/DocumentoIndicadoresCard";

// Página pública dedicada de um único documento do Portal Previdenciário (ex.:
// /portal-previdenciario/:slug/dpin) — mesmo menu/rodapé do restante do Portal Previdenciário
// (PortalPrevidenciarioLayout), mas mostrando só os indicadores deste documento, sem o filtro
// multi-documento de PortalPrevidenciarioPage.
export function PortalPrevidenciarioDocumentoPage() {
  const { slug, codigo } = useParams<{ slug: string; codigo: string }>();
  const [dados, setDados] = useState<PortalPrevidenciario | null>(null);
  const [documento, setDocumento] = useState<PortalDocumentoPublicoDetalhe | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    api
      .portalPrevidenciario(slug)
      .then(setDados)
      .catch((err) => setErro(err instanceof Error ? err.message : "Erro ao carregar o Portal Previdenciário."));
  }, [slug]);

  useEffect(() => {
    if (!slug || !codigo) return;
    api
      .portalPrevidenciarioDocumento(slug, codigo)
      .then((res) => setDocumento(res.documento))
      .catch((err) => setErro(err instanceof Error ? err.message : "Documento não encontrado."));
  }, [slug, codigo]);

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
        <h1 className="font-display text-2xl font-bold text-ink">{documento?.nome ?? "Carregando…"}</h1>
        {dados && <p className="mt-1 text-sm text-ink-muted">{dados.tenant.federatedEntity}</p>}

        {!documento ? (
          <p className="mt-8 text-sm text-ink-muted">Carregando indicadores…</p>
        ) : documento.indicadores.every((i) => i.valores.length === 0) ? (
          <Card className="mt-8 p-6">
            <p className="text-sm text-ink-muted">Nenhum indicador foi lançado ainda para este documento.</p>
          </Card>
        ) : (
          <div className="mt-8">
            <div className="mb-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => baixarCsv(`${documento.codigo}.csv`, [documento])}>
                <Download size={14} /> Exportar CSV
              </Button>
              <Button variant="ghost" onClick={() => window.print()}>
                <Printer size={14} /> Imprimir
              </Button>
            </div>
            <DocumentoIndicadoresCard documento={documento} />
          </div>
        )}
      </div>
    </PortalPrevidenciarioLayout>
  );
}
