import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { Building2, CalendarClock } from "lucide-react";
import { api, type PaginaIndiceTransparencia, type PortalPrevidenciario, type RegistroTransparenciaApi, type TransparenciaApiConteudo } from "../lib/api";
import { Card } from "../components/ui/Card";
import { PortalPrevidenciarioLayout } from "../components/layout/PortalPrevidenciarioLayout";
import { EntidadesCredenciadasView } from "../components/portal-previdenciario/EntidadesCredenciadasView";
import { ListaDocumentosView } from "../components/portal-previdenciario/ListaDocumentosView";
import { PortalBasico } from "../components/portal-basico/PortalBasico";
import { CONFIG_ENTIDADES_BASICA, configDaLista } from "../components/portal-previdenciario/listaDocumentosConfigs";
import { PortalPrevidenciarioDocumentoPage } from "./PortalPrevidenciarioDocumentoPage";
import { useAutoRefresh } from "../lib/useAutoRefresh";

// Páginas do Portal Previdenciário alimentadas pela cópia dos dados das APIs de transparência (Nexa, com chave,
// e o portal de transparência do órgão, sem chave). Cada `codigo` (ver transparencia-api/catalogo.ts no backend)
// é uma lista configurada em listaDocumentosConfigs.ts; só as entidades credenciadas têm página própria.
// O ESTILO vem do cadastro do cliente: "completo" (busca inteligente, gráficos, todos os campos) ou "basico"
// (filtros simples + lista, no padrão do portal de transparência do órgão).
// Código que não é nenhum destes cai no comportamento antigo (documento DAIR/DPIN).
function ehPaginaApi(codigo: string): boolean {
  return codigo === "entidades-credenciadas" || configDaLista(codigo) !== null;
}

// Estilo COMPLETO (o estilo básico é uma página à parte, ver PortalBasico)
function Visao({ codigo, registros }: { codigo: string; registros: RegistroTransparenciaApi[] }) {
  const config = useMemo(() => configDaLista(codigo), [codigo]);
  if (codigo === "entidades-credenciadas") return <EntidadesCredenciadasView registros={registros} />;
  if (!config) return null;
  return <ListaDocumentosView registros={registros} config={config} />;
}

// Mesma rota do DAIR/DPIN (/portal-previdenciario/:slug/:codigo): decide qual dos dois tipos de página é.
export function PortalPrevidenciarioRota() {
  const { codigo } = useParams<{ codigo: string }>();
  return codigo && ehPaginaApi(codigo) ? <PortalPrevidenciarioApiPage /> : <PortalPrevidenciarioDocumentoPage />;
}

function PortalPrevidenciarioApiPage() {
  const { slug, codigo } = useParams<{ slug: string; codigo: string }>();
  const [params, setParams] = useSearchParams();
  const [dados, setDados] = useState<PortalPrevidenciario | null>(null);
  const [conteudo, setConteudo] = useState<TransparenciaApiConteudo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [erroConteudo, setErroConteudo] = useState<string | null>(null);
  const [paginas, setPaginas] = useState<PaginaIndiceTransparencia[]>([]);
  const ultimaRequisicao = useRef(0);

  // No estilo BÁSICO, a página "publicacoes" é um ponto único: o filtro de tipo (?tipo=<código>) troca o conjunto
  // de dados exibido (tipos de publicação, documentos da API Nexa, licitações, contratos…).
  const hub = dados?.tenant.estiloPaginas === "basico" && codigo === "publicacoes";
  // Estilo básico tem UMA página só (publicacoes): os endereços antigos (pub-dair, acordaos-tce, licitacoes…)
  // levam para ela com o tipo já escolhido, em vez de existirem como páginas separadas.
  const redireciona = dados?.tenant.estiloPaginas === "basico" && !!codigo && codigo !== "publicacoes";
  const tipoUrl = params.get("tipo") ?? "";
  const codigoEfetivo = hub && tipoUrl ? tipoUrl : codigo;
  const config = useMemo(
    () => (codigoEfetivo === "entidades-credenciadas" ? CONFIG_ENTIDADES_BASICA : configDaLista(codigoEfetivo ?? "")),
    [codigoEfetivo],
  );

  const carregarDados = useCallback(() => {
    if (!slug) return;
    api
      .portalPrevidenciario(slug)
      .then(setDados)
      .catch((err) => setErro(err instanceof Error ? err.message : "Erro ao carregar o Portal Previdenciário."));
  }, [slug]);

  const carregarConteudo = useCallback(() => {
    if (!slug || !codigoEfetivo || redireciona) return;
    const id = ++ultimaRequisicao.current; // resposta atrasada de um tipo anterior não pode sobrescrever o atual
    api
      .portalPrevidenciarioTransparenciaApi(slug, codigoEfetivo)
      .then((c) => {
        if (id !== ultimaRequisicao.current) return;
        setConteudo(c);
        setErroConteudo(null);
      })
      .catch((err) => {
        if (id !== ultimaRequisicao.current) return;
        const msg = err instanceof Error ? err.message : "Página não encontrada.";
        // no hub um tipo inválido não derruba a página: mostra a mensagem na lista
        if (hub) setErroConteudo(msg);
        else setErro(msg);
      });
  }, [slug, codigoEfetivo, hub, redireciona]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);
  useEffect(() => {
    setConteudo(null); // outro tipo escolhido: some a lista antiga enquanto a nova carrega
    setErroConteudo(null);
    carregarConteudo();
  }, [carregarConteudo]);
  useEffect(() => {
    if (!hub || !slug) return;
    api
      .portalPrevidenciarioPaginas(slug)
      .then((r) => setPaginas(r.paginas))
      .catch(() => setPaginas([]));
  }, [hub, slug]);
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

  // Cliente no estilo BÁSICO: página própria, no visual do portal de transparência do órgão (sem o layout do
  // nosso portal). Enquanto ainda não sabemos o estilo do cliente, nada é desenhado (evita piscar o layout errado).
  if (!dados) return <div style={{ minHeight: "100vh", background: "#f4f6f8" }} aria-busy="true" />;
  if (redireciona) return <Navigate to={`/portal-previdenciario/${slug}/publicacoes?tipo=${encodeURIComponent(codigo ?? "")}`} replace />;
  if (dados.tenant.estiloPaginas === "basico") {
    return (
      <PortalBasico
        slug={slug ?? ""}
        dados={dados}
        titulo={conteudo?.titulo ?? "Carregando…"}
        atualizadoEm={conteudo?.atualizadoEm ?? null}
        registros={conteudo?.registros ?? []}
        config={conteudo ? config : null}
        chave={codigoEfetivo ?? ""}
        erroConteudo={erroConteudo}
        hub={
          hub
            ? {
                paginas,
                tipo: tipoUrl,
                // "" volta para todas as publicações; qualquer outro valor vira ?tipo=<código> (voltar do navegador funciona)
                onTipo: (c) => setParams(c ? { tipo: c } : {}),
              }
            : undefined
        }
      />
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
              {dados.tenant.transparenciaUrl && (
                <a href={dados.tenant.transparenciaUrl} className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-petrol hover:underline">
                  ← Voltar à Transparência
                </a>
              )}
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
          <Visao codigo={codigo} registros={conteudo.registros} />
        )}
      </div>
    </PortalPrevidenciarioLayout>
  );
}
