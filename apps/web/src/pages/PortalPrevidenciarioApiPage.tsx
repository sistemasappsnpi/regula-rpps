import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { Building2, CalendarClock } from "lucide-react";
import { api, type PaginaIndiceTransparencia, type PortalPrevidenciario, type RegistroTransparenciaApi, type TransparenciaApiConteudo } from "../lib/api";
import { Card } from "../components/ui/Card";
import { PortalPrevidenciarioLayout } from "../components/layout/PortalPrevidenciarioLayout";
import { EntidadesCredenciadasView } from "../components/portal-previdenciario/EntidadesCredenciadasView";
import { ListaDocumentosView } from "../components/portal-previdenciario/ListaDocumentosView";
import { PortalBasico } from "../components/portal-basico/PortalBasico";
import type { ConfigListaDocumentos } from "../components/portal-previdenciario/ListaDocumentosView";
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
  const [paginasProntas, setPaginasProntas] = useState(false);
  const ultimaRequisicao = useRef(0);

  // No estilo BÁSICO, a página "publicacoes" é um ponto único: o filtro de tipo (?tipo=<código>) troca o conjunto
  // de dados exibido. Quando o cliente tem a API Nexa, o hub mostra SÓ os documentos da Nexa (cópia fiel, todos os
  // campos); só sem Nexa ele cai para tudo o que o portal do órgão publica.
  const hub = dados?.tenant.estiloPaginas === "basico" && codigo === "publicacoes";
  // Estilo básico tem UMA página só (publicacoes): os endereços antigos (pub-dair, acordaos-tce, licitacoes…)
  // levam para ela com o tipo já escolhido, em vez de existirem como páginas separadas.
  const redireciona = dados?.tenant.estiloPaginas === "basico" && !!codigo && codigo !== "publicacoes";
  const paginasHub = useMemo(() => {
    const nexa = paginas.filter((p) => p.origem === "nexa");
    return nexa.length > 0 ? nexa : paginas;
  }, [paginas]);
  const soNexa = paginasHub.length > 0 && paginasHub.every((p) => p.origem === "nexa");
  const tipoPedido = params.get("tipo") ?? "";
  // tipo fora da lista do hub (endereço antigo de uma página do portal) vale como "todos"
  const tipoUrl = !paginasProntas || paginasHub.some((p) => p.codigo === tipoPedido) ? tipoPedido : "";
  const todosNexa = hub && !tipoUrl && soNexa;
  const codigoEfetivo = hub && tipoUrl ? tipoUrl : codigo;
  const configDe = (c: string) => (c === "entidades-credenciadas" ? CONFIG_ENTIDADES_BASICA : configDaLista(c));
  const config = useMemo(() => {
    if (!todosNexa) return configDe(codigoEfetivo ?? "");
    // lista única com os tipos da Nexa: cada registro usa a config do seu próprio tipo (marcado em _codigo/_titulo)
    const por = (r: RegistroTransparenciaApi) => configDe(String(r._codigo ?? ""));
    return {
      rotuloItens: "documentos",
      titulo: (r) => por(r)?.titulo(r) ?? "",
      detalhe: (r) => por(r)?.detalhe?.(r) ?? "",
      ano: (r) => por(r)?.ano(r) ?? null,
      // as escalas de "ordem" de cada tipo não se misturam: ano primeiro, depois a ordem do próprio tipo
      ordem: (r, i) => {
        const c = por(r);
        const ano = c?.ano(r) ?? 0;
        return ano * 1e9 + 5e8 + Math.max(-4e8, Math.min(4e8, c?.ordem(r, i) ?? 0));
      },
      grupo: { rotulo: "Tipo", rotuloPlural: "Tipos", valor: (r) => String(r._titulo ?? "") },
      links: [],
      linksDe: (r) => por(r)?.links ?? [],
    } as ConfigListaDocumentos;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todosNexa, codigoEfetivo]);

  const carregarDados = useCallback(() => {
    if (!slug) return;
    api
      .portalPrevidenciario(slug)
      .then(setDados)
      .catch((err) => setErro(err instanceof Error ? err.message : "Erro ao carregar o Portal Previdenciário."));
  }, [slug]);

  const carregarConteudo = useCallback(() => {
    if (!slug || !codigoEfetivo || redireciona) return;
    if (hub && !paginasProntas) return; // ainda não sabemos se o cliente tem Nexa
    const id = ++ultimaRequisicao.current; // resposta atrasada de um tipo anterior não pode sobrescrever o atual
    const falhou = (err: unknown) => {
      if (id !== ultimaRequisicao.current) return;
      const msg = err instanceof Error ? err.message : "Página não encontrada.";
      // no hub um tipo inválido não derruba a página: mostra a mensagem na lista
      if (hub) setErroConteudo(msg);
      else setErro(msg);
    };
    if (todosNexa) {
      Promise.all(
        paginasHub.map((p) =>
          api.portalPrevidenciarioTransparenciaApi(slug, p.codigo).then((c) => ({ p, c })),
        ),
      )
        .then((partes) => {
          if (id !== ultimaRequisicao.current) return;
          const registros = partes.flatMap(({ p, c }) => c.registros.map((r) => ({ ...r, _codigo: p.codigo, _titulo: p.titulo })));
          const atualizadoEm = partes.map(({ c }) => c.atualizadoEm).filter(Boolean).sort().pop() ?? null;
          setConteudo({ codigo: "publicacoes", titulo: "Publicações", atualizadoEm, registros } as TransparenciaApiConteudo);
          setErroConteudo(null);
        })
        .catch(falhou);
      return;
    }
    api
      .portalPrevidenciarioTransparenciaApi(slug, codigoEfetivo)
      .then((c) => {
        if (id !== ultimaRequisicao.current) return;
        setConteudo(c);
        setErroConteudo(null);
      })
      .catch(falhou);
  }, [slug, codigoEfetivo, hub, redireciona, todosNexa, paginasHub, paginasProntas]);

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
      .catch(() => setPaginas([]))
      .finally(() => setPaginasProntas(true));
  }, [hub, slug]);  useAutoRefresh(() => {
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
                paginas: paginasHub,
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
