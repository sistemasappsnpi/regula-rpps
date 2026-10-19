import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Building2, CalendarClock } from "lucide-react";
import { api, type PortalPrevidenciario, type RegistroTransparenciaApi, type TransparenciaApiConteudo } from "../lib/api";
import { Card } from "../components/ui/Card";
import { PortalPrevidenciarioLayout } from "../components/layout/PortalPrevidenciarioLayout";
import { EntidadesCredenciadasView } from "../components/portal-previdenciario/EntidadesCredenciadasView";
import { ListaDocumentosView } from "../components/portal-previdenciario/ListaDocumentosView";
import { ListaBasicaView } from "../components/portal-previdenciario/ListaBasicaView";
import { CONFIG_ENTIDADES_BASICA, configDaLista } from "../components/portal-previdenciario/listaDocumentosConfigs";
import { PortalPrevidenciarioDocumentoPage } from "./PortalPrevidenciarioDocumentoPage";
import { useAutoRefresh } from "../lib/useAutoRefresh";

// Páginas do Portal Previdenciário alimentadas pela cópia dos dados das APIs de transparência (Nexa, com chave,
// e o portal de transparência do órgão, sem chave). Cada `codigo` (ver transparencia-api/catalogo.ts no backend)
// é uma lista configurada em listaDocumentosConfigs.ts; só as entidades credenciadas têm página própria.
// O ESTILO vem do cadastro do cliente: "completo" (busca inteligente, gráficos, todos os campos) ou "basico"
// (filtros simples + lista, no padrão do portal de transparência do órgão).
// Código que não é nenhum destes cai no comportamento antigo (documento DAIR/DPIN).
type Estilo = "completo" | "basico";

function ehPaginaApi(codigo: string): boolean {
  return codigo === "entidades-credenciadas" || configDaLista(codigo) !== null;
}

function Visao({ codigo, registros, estilo }: { codigo: string; registros: RegistroTransparenciaApi[]; estilo: Estilo }) {
  const config = useMemo(() => (codigo === "entidades-credenciadas" ? CONFIG_ENTIDADES_BASICA : configDaLista(codigo)), [codigo]);
  if (codigo === "entidades-credenciadas" && estilo === "completo") return <EntidadesCredenciadasView registros={registros} />;
  if (!config) return null;
  return estilo === "basico" ? <ListaBasicaView registros={registros} config={config} /> : <ListaDocumentosView registros={registros} config={config} />;
}

// Mesma rota do DAIR/DPIN (/portal-previdenciario/:slug/:codigo): decide qual dos dois tipos de página é.
export function PortalPrevidenciarioRota() {
  const { codigo } = useParams<{ codigo: string }>();
  return codigo && ehPaginaApi(codigo) ? <PortalPrevidenciarioApiPage /> : <PortalPrevidenciarioDocumentoPage />;
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

  return (
    <PortalPrevidenciarioLayout
      tenantNome={dados?.tenant.name ?? "Portal Previdenciário"}
      tenantLogoUrl={dados?.tenant.logoUrl}
      corPrimaria={dados?.tenant.corPrimaria}
      corDestaque={dados?.tenant.corDestaque}
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

        {!conteudo || !dados || !codigo ? (
          <p className="mt-8 text-sm text-ink-muted">Carregando…</p>
        ) : (
          <Visao codigo={codigo} registros={conteudo.registros} estilo={dados.tenant.estiloPaginas} />
        )}
      </div>
    </PortalPrevidenciarioLayout>
  );
}
