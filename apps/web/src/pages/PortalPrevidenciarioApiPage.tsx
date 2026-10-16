import { useCallback, useEffect, useState, type ComponentType } from "react";
import { useParams } from "react-router-dom";
import { Building2, CalendarClock } from "lucide-react";
import { api, type PortalPrevidenciario, type RegistroTransparenciaApi, type TransparenciaApiConteudo } from "../lib/api";
import { Card } from "../components/ui/Card";
import { PortalPrevidenciarioLayout } from "../components/layout/PortalPrevidenciarioLayout";
import { EntidadesCredenciadasView } from "../components/portal-previdenciario/EntidadesCredenciadasView";
import { ListaDocumentosView } from "../components/portal-previdenciario/ListaDocumentosView";
import { CONFIGS_LISTA_DOCUMENTOS } from "../components/portal-previdenciario/listaDocumentosConfigs";
import { PortalPrevidenciarioDocumentoPage } from "./PortalPrevidenciarioDocumentoPage";
import { useAutoRefresh } from "../lib/useAutoRefresh";

// Páginas do Portal Previdenciário alimentadas pela API Nexa de Transparência (cópia no nosso banco).
// Cada `codigo` (o mesmo do catálogo da API, ver transparencia-api/catalogo.ts) tem a sua visão;
// os que ainda não têm visão pronta não entram aqui e caem no comportamento antigo (documento).
const VISOES: Record<string, ComponentType<{ registros: RegistroTransparenciaApi[] }>> = {
  "entidades-credenciadas": EntidadesCredenciadasView,
  // páginas "lista de documentos": mesmo molde (ListaDocumentosView), cada uma com a sua config
  ...Object.fromEntries(
    Object.entries(CONFIGS_LISTA_DOCUMENTOS).map(([codigo, config]) => [
      codigo,
      ({ registros }: { registros: RegistroTransparenciaApi[] }) => <ListaDocumentosView registros={registros} config={config} />,
    ]),
  ),
};

// Mesma rota do DAIR/DPIN (/portal-previdenciario/:slug/:codigo): decide qual dos dois tipos de página é.
export function PortalPrevidenciarioRota() {
  const { codigo } = useParams<{ codigo: string }>();
  return codigo && VISOES[codigo] ? <PortalPrevidenciarioApiPage /> : <PortalPrevidenciarioDocumentoPage />;
}

function PortalPrevidenciarioApiPage() {
  const { slug, codigo } = useParams<{ slug: string; codigo: string }>();
  const [dados, setDados] = useState<PortalPrevidenciario | null>(null);
  const [conteudo, setConteudo] = useState<TransparenciaApiConteudo | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregarDados = useCallback(() => {
    if (!slug) return;
    api
      .portalPrevidenciario(slug)
      .then(setDados)
      .catch((err) => setErro(err instanceof Error ? err.message : "Erro ao carregar o Portal Previdenciário."));
  }, [slug]);

  const carregarConteudo = useCallback(() => {
    if (!slug || !codigo) return;
    api
      .portalPrevidenciarioTransparenciaApi(slug, codigo)
      .then(setConteudo)
      .catch((err) => setErro(err instanceof Error ? err.message : "Página não encontrada."));
  }, [slug, codigo]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);
  useEffect(() => {
    carregarConteudo();
  }, [carregarConteudo]);
  useAutoRefresh(() => {
    carregarDados();
    carregarConteudo();
  });

  if (erro) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <Card className="max-w-md p-6 text-center">
          <p className="text-sm text-ink-muted">{erro}</p>
        </Card>
      </div>
    );
  }

  const Visao = codigo ? VISOES[codigo] : undefined;

  return (
    <PortalPrevidenciarioLayout
      tenantNome={dados?.tenant.name ?? "Portal Previdenciário"}
      tenantLogoUrl={dados?.tenant.logoUrl}
      corPrimaria={dados?.tenant.corPrimaria}
      siteUrl={dados?.tenant.site}
      slug={slug}
      menu={dados?.menu ?? null}
      rodape={dados?.rodape ?? null}
      sincronizadoEm={dados?.sincronizadoEm ?? null}
    >
      <div className="mx-auto max-w-7xl">
        <div className="relative mb-2 overflow-hidden rounded-2xl border border-border bg-surface/80 px-5 py-6 shadow-lift sm:px-8 sm:py-8">
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-petrol">Transparência</p>
              <h1 className="mt-1 font-display text-2xl font-extrabold leading-tight text-ink sm:text-4xl">
                {conteudo?.titulo ?? "Carregando…"}
              </h1>
              {dados && (
                <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-ink-muted">
                  <Building2 size={15} className="shrink-0 text-petrol" />
                  {dados.tenant.federatedEntity}
                </p>
              )}
              {conteudo?.atualizadoEm && (
                <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-bg px-3 py-1 text-xs font-medium text-ink">
                  <CalendarClock size={13} className="text-gold" />
                  Atualizado em {new Date(conteudo.atualizadoEm).toLocaleDateString("pt-BR")}
                </p>
              )}
            </div>
          </div>
        </div>

        {!conteudo || !Visao ? <p className="mt-8 text-sm text-ink-muted">Carregando…</p> : <Visao registros={conteudo.registros} />}
      </div>
    </PortalPrevidenciarioLayout>
  );
}
