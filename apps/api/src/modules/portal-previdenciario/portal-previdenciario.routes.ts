import * as fs from "node:fs";
import * as path from "node:path";
import { Router } from "express";
import { env } from "../../config/env";
import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { criarCache } from "../../middleware/publicProtect";
import {
  CATALOGO_PORTAL,
  CATALOGO_TRANSPARENCIA_API,
  ENDPOINT_COLEGIADOS,
  ENDPOINT_PUBLICACOES,
  PREFIXO_COLEGIADO,
  PREFIXO_PUBLICACAO,
  endpointPorCodigo,
  paginaPortalPorCodigo,
  slugDoTipo,
  tituloAmigavel,
} from "../transparencia-api/catalogo";
import { camposDeLink, hashUrl } from "../transparencia-api/arquivos";

// Rota pública (sem requireAuth), mesmo padrão de /public/transparencia: o Portal
// Previdenciário deste RPPS é público por definição. Diferente da Transparência, aqui não há
// feature nem dado próprio do Regula RPPS — o menu e o rodapé vêm ao vivo das APIs externas que
// o Admin Global configurou para este cliente (Tenant.portalMenuApiUrl / portalRodapeApiUrl),
// no mesmo formato do endpoint "dadosabertosexportar" usado como referência (modelo IPRES).
export const portalPrevidenciarioPublicRouter = Router();

interface MenuBruto {
  Id: string;
  NMenu: string | null;
  Nome: string;
  Pagina: string | null;
  NovaPag: string | null;
  Ordem: string | null;
}

export interface PortalPrevidenciarioMenuItem {
  id: string;
  nome: string;
  pagina: string;
  novaPag: string;
  itens: PortalPrevidenciarioMenuItem[];
}

// Espelha buildMenuTree do modelo de referência: cada item aponta pro pai via NMenu (null = raiz),
// ordenado por Ordem em cada nível.
function montarArvoreMenu(bruto: MenuBruto[]): PortalPrevidenciarioMenuItem[] {
  const porId = new Map<string, PortalPrevidenciarioMenuItem>();
  const ordemPorId = new Map<string, number>();

  for (const item of bruto) {
    porId.set(item.Id, {
      id: item.Id,
      nome: item.Nome,
      pagina: item.Pagina || "#",
      novaPag: item.NovaPag || "",
      itens: [],
    });
    ordemPorId.set(item.Id, Number(item.Ordem) || 0);
  }

  const raizes: PortalPrevidenciarioMenuItem[] = [];
  for (const bruto0 of bruto) {
    const item = porId.get(bruto0.Id)!;
    if (bruto0.NMenu && porId.has(bruto0.NMenu)) {
      porId.get(bruto0.NMenu)!.itens.push(item);
    } else if (!bruto0.NMenu) {
      raizes.push(item);
    }
  }

  const porOrdem = (a: PortalPrevidenciarioMenuItem, b: PortalPrevidenciarioMenuItem) =>
    (ordemPorId.get(a.id) ?? 0) - (ordemPorId.get(b.id) ?? 0);
  raizes.sort(porOrdem);
  raizes.forEach((r) => r.itens.sort(porOrdem));

  return raizes;
}

// Menu/rodapé mudam raramente: uma busca real por URL a cada 5 min, não uma por visita (antes cada
// carga de página e cada refresh automático chamava a API externa do cliente).
const cacheExterno = criarCache<unknown | null>(5 * 60_000);
// Resposta pronta dos indicadores (várias consultas ao banco por chamada): 30s é o bastante pra
// absorver picos e ainda mostrar uma aprovação recente quase na hora.
const cacheIndicadores = criarCache<unknown>(30_000);

async function buscarJson(url: string): Promise<unknown | null> {
  try {
    return await cacheExterno(url, async () => {
      const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    });
  } catch {
    return null;
  }
}

export interface PortalPrevidenciarioRodape {
  cnpj: string | null;
  telefone: string | null;
  email: string | null;
  rua: string | null;
  numero: string | null;
  bairro: string | null;
  cep: string | null;
  horario: string | null;
  facebook: string | null;
  twitter: string | null;
  instagram: string | null;
  youtube: string | null;
  whatsapp: string | null;
  prefeito: string | null;
}

function mapearRodape(bruto: unknown): PortalPrevidenciarioRodape | null {
  const item = Array.isArray(bruto) ? bruto[0] : null;
  if (!item || typeof item !== "object") return null;
  const r = item as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  return {
    cnpj: texto(r.CNPJ),
    telefone: texto(r.Telefone),
    email: texto(r.Email),
    rua: texto(r.Rua),
    numero: texto(r.Numero),
    bairro: texto(r.Bairro),
    cep: texto(r.Cep),
    horario: texto(r.Horario),
    facebook: texto(r.Facebook),
    twitter: texto(r.Twitter),
    instagram: texto(r.Instagram),
    youtube: texto(r.Youtube),
    whatsapp: texto(r.Whatsapp),
    prefeito: texto(r.Prefeito),
  };
}

// Endereço da "transparência modelo" integrada a este cliente (portal do gerador com config.integracaoPrevidencia.slug =
// <slug>): as páginas da Previdência mostram um link "Voltar à Transparência" para ele.
const cacheTransparenciaIntegrada = criarCache<{ slug: string; pasta: string }[]>(60_000);
async function urlTransparenciaIntegrada(slugCliente: string): Promise<string | null> {
  const portais = await cacheTransparenciaIntegrada("integrados", async () => {
    const linhas = await prisma.transparenciaPortal.findMany({ select: { pasta: true, config: true } });
    return linhas
      .map((l) => ({ pasta: l.pasta, slug: String(((l.config as Record<string, unknown> | null)?.integracaoPrevidencia as { slug?: unknown } | undefined)?.slug ?? "") }))
      .filter((p) => p.slug !== "");
  });
  const achado = portais.find((p) => p.slug === slugCliente);
  return achado ? `${env.webUrl.replace(/\/+$/, "")}/api/public/transparencia-portal/${achado.pasta}/` : null;
}

portalPrevidenciarioPublicRouter.get("/:slug", async (req, res, next) => {
  try {
    const tenant = await prisma.tenant.findUnique({ where: { slug: req.params.slug } });
    if (!tenant) throw new HttpError(404, "RPPS não encontrado.");

    if (!tenant.portalMenuApiUrl && !tenant.portalRodapeApiUrl) {
      res.status(404).json({ error: "Portal Previdenciário ainda não configurado para este RPPS." });
      return;
    }

    const [menuBruto, rodapeBruto] = await Promise.all([
      tenant.portalMenuApiUrl ? buscarJson(tenant.portalMenuApiUrl) : Promise.resolve(null),
      tenant.portalRodapeApiUrl ? buscarJson(tenant.portalRodapeApiUrl) : Promise.resolve(null),
    ]);

    const menu = Array.isArray(menuBruto) ? montarArvoreMenu(menuBruto as MenuBruto[]) : null;
    const rodape = mapearRodape(rodapeBruto);

    res.json({
      tenant: {
        name: tenant.name,
        federatedEntity: tenant.federatedEntity,
        slug: tenant.slug,
        logoUrl: tenant.logoUrl,
        corPrimaria: tenant.portalCorPrimaria,
        corDestaque: tenant.portalCorDestaque,
        estiloPaginas: tenant.portalEstiloPaginas === "basico" ? "basico" : "completo",
        site: tenant.site,
        transparenciaUrl: await urlTransparenciaIntegrada(tenant.slug).catch(() => null),
      },
      menu,
      menuConfigurado: Boolean(tenant.portalMenuApiUrl),
      rodape,
      rodapeConfigurado: Boolean(tenant.portalRodapeApiUrl),
      sincronizadoEm: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// Conteúdo central (relatório/filtro/gráfico): valores já lançados (manual ou aprovados via
// Construtor de Documentos) dos indicadores do catálogo — ver PortalDocumento/PortalIndicador/
// TenantPortalIndicadorValor. Público, sem feature flag, mesmo padrão do endpoint de menu/rodapé
// acima (decisão deliberada de manter simples).
// Monta a representação pública de um lote de indicadores (valores vigentes por competência) —
// compartilhado pelas duas rotas de conteúdo abaixo. Indicador sem subcampo é escalar (um valor
// vigente por competência, igual de sempre); indicador COM subcampos vira um "grupo" — todas as
// ocorrências ativas daquela competência aparecem (nunca só a mais recente: um grupo pode ter
// várias ocorrências legítimas ao mesmo tempo, ex. vários membros de um comitê).
async function indicadoresParaPublico(
  indicadores: {
    id: string;
    nome: string;
    tipo: string;
    unidade: string | null;
    subcampos: { id: string; subcampoId: string; nome: string; tipo: string; unidade: string | null; sortOrder: number }[];
  }[],
  tenantId: string,
) {
  const escalares = indicadores.filter((i) => i.subcampos.length === 0);
  const grupos = indicadores.filter((i) => i.subcampos.length > 0);

  const escalarIds = escalares.map((i) => i.id);
  const valores = escalarIds.length
    ? await prisma.tenantPortalIndicadorValor.findMany({
        where: { tenantId, indicadorId: { in: escalarIds } },
        orderBy: { createdAt: "desc" },
        include: { documentoUpload: { select: { id: true, nomeArquivo: true } } },
      })
    : [];
  const seen = new Set<string>();
  const vigentes: typeof valores = [];
  for (const v of valores) {
    const key = `${v.indicadorId}|${v.competencia.toISOString()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    vigentes.push(v);
  }

  const grupoIds = grupos.map((i) => i.id);
  const instancias = grupoIds.length
    ? await prisma.tenantPortalIndicadorInstancia.findMany({
        where: { tenantId, indicadorId: { in: grupoIds }, ativo: true },
        orderBy: { competencia: "asc" },
        include: { documentoUpload: { select: { id: true, nomeArquivo: true } }, valores: true },
      })
    : [];

  return indicadores.map((indicador) => {
    if (indicador.subcampos.length === 0) {
      return {
        id: indicador.id,
        nome: indicador.nome,
        tipo: indicador.tipo,
        unidade: indicador.unidade,
        valores: vigentes
          .filter((v) => v.indicadorId === indicador.id)
          .sort((a, b) => a.competencia.getTime() - b.competencia.getTime())
          .map((v) => ({
            competencia: v.competencia,
            valor: v.valor,
            origem: v.origem,
            documentoUploadId: v.documentoUpload?.id ?? null,
            documentoUploadNome: v.documentoUpload?.nomeArquivo ?? null,
          })),
      };
    }

    const nomePorSubcampoId = new Map(indicador.subcampos.map((s) => [s.id, s]));
    return {
      id: indicador.id,
      nome: indicador.nome,
      tipo: indicador.tipo,
      unidade: indicador.unidade,
      valores: [],
      subcampos: indicador.subcampos.map((s) => ({ subcampoId: s.id, nome: s.nome, tipo: s.tipo, unidade: s.unidade })),
      instancias: instancias
        .filter((inst) => inst.indicadorId === indicador.id)
        .map((inst) => ({
          id: inst.id,
          competencia: inst.competencia,
          documentoUploadId: inst.documentoUpload?.id ?? null,
          documentoUploadNome: inst.documentoUpload?.nomeArquivo ?? null,
          subcampoValores: inst.valores
            .sort((a, b) => (nomePorSubcampoId.get(a.subcampoId)?.sortOrder ?? 0) - (nomePorSubcampoId.get(b.subcampoId)?.sortOrder ?? 0))
            .map((v) => ({ subcampoId: v.subcampoId, nome: nomePorSubcampoId.get(v.subcampoId)?.nome ?? v.subcampoId, valor: v.valor })),
        })),
    };
  });
}

portalPrevidenciarioPublicRouter.get("/:slug/indicadores", async (req, res, next) => {
  try {
    const tenant = await prisma.tenant.findUnique({ where: { slug: req.params.slug } });
    if (!tenant) throw new HttpError(404, "RPPS não encontrado.");

    const corpo = await cacheIndicadores(`ind|${tenant.id}`, async () => {
      const documentos = await prisma.portalDocumento.findMany({
        where: { ativo: true },
        orderBy: { sortOrder: "asc" },
        include: { indicadores: { orderBy: { sortOrder: "asc" }, include: { subcampos: { orderBy: { sortOrder: "asc" } } } } },
      });

      // um documento por vez: Promise.all abria todas as consultas ao mesmo tempo e esgotava o pool do banco
      const documentosComValores = [];
      for (const doc of documentos) {
        documentosComValores.push({
          id: doc.id,
          nome: doc.nome,
          indicadores: await indicadoresParaPublico(doc.indicadores, tenant.id),
        });
      }

      return {
        documentos: documentosComValores.filter((doc) => doc.indicadores.some((i) => i.valores.length > 0 || (i.instancias?.length ?? 0) > 0)),
      };
    });

    res.json(corpo);
  } catch (err) {
    next(err);
  }
});

// Página pública dedicada de um único documento (ex.: /portal-previdenciario/:slug/dpin) — mesmo
// dado do endpoint "/indicadores" acima, só que escopado a um documento (resolvido pelo `codigo`
// do DocumentoPersonalizado, já que é ele que o admin nomeia em Parametrizações → Personalizados),
// pra render de menu/rodapé + gráfico próprios dessa página.
portalPrevidenciarioPublicRouter.get("/:slug/documentos/:codigo", async (req, res, next) => {
  try {
    const tenant = await prisma.tenant.findUnique({ where: { slug: req.params.slug } });
    if (!tenant) throw new HttpError(404, "RPPS não encontrado.");

    const docPersonalizado = await prisma.documentoPersonalizado.findUnique({
      where: { codigo: req.params.codigo },
    });
    if (!docPersonalizado || !docPersonalizado.ativo || !docPersonalizado.portalDocumentoId) {
      throw new HttpError(404, "Documento não encontrado.");
    }

    const documento = await prisma.portalDocumento.findUnique({
      where: { id: docPersonalizado.portalDocumentoId },
      include: { indicadores: { orderBy: { sortOrder: "asc" }, include: { subcampos: { orderBy: { sortOrder: "asc" } } } } },
    });
    if (!documento || !documento.ativo) throw new HttpError(404, "Documento não encontrado.");

    const corpo = await cacheIndicadores(`doc|${tenant.id}|${documento.id}`, async () => ({
      documento: {
        id: documento.id,
        nome: documento.nome,
        codigo: docPersonalizado.codigo,
        indicadores: await indicadoresParaPublico(documento.indicadores, tenant.id),
      },
    }));
    res.json(corpo);
  } catch (err) {
    next(err);
  }
});

// Páginas alimentadas pela cópia local dos dados da API Nexa de Transparência (com chave) e dos dados abertos do
// portal de transparência do órgão (sem chave) — ex.: /portal-previdenciario/:slug/entidades-credenciadas ou
// /portal-previdenciario/:slug/pub-investimentos. Lê SEMPRE da cópia no nosso banco (TransparenciaApiRegistro),
// nunca da fonte — a coleta roda à parte (ver transparencia-api/coletor.ts).
interface PaginaResolvida {
  titulo: string;
  endpoint: string;
  tipoSlug?: string; // páginas "pub-<tipo>": só as publicações desse tipo
  colegiado?: { id: string; tipo: string | null }; // páginas "col-<id>[-<tipo>]": documentos de um colegiado
}

function resolverPagina(codigo: string): PaginaResolvida | null {
  const nexa = endpointPorCodigo(codigo);
  if (nexa) return { titulo: nexa.titulo, endpoint: nexa.codigo };
  const portal = paginaPortalPorCodigo(codigo);
  if (portal) return { titulo: portal.titulo, endpoint: portal.endpoint };
  if (codigo.startsWith(PREFIXO_PUBLICACAO) && codigo.length > PREFIXO_PUBLICACAO.length) {
    return { titulo: "Publicações", endpoint: ENDPOINT_PUBLICACOES, tipoSlug: codigo.slice(PREFIXO_PUBLICACAO.length) };
  }
  const col = codigo.match(/^col-(\d+)(?:-(\d+))?$/);
  if (col) return { titulo: "Documentos do colegiado", endpoint: ENDPOINT_COLEGIADOS, colegiado: { id: col[1], tipo: col[2] ?? null } };
  return null;
}

function campoTexto(dados: unknown, campo: string): string {
  const v = dados && typeof dados === "object" ? (dados as Record<string, unknown>)[campo] : "";
  return typeof v === "string" ? v.trim() : "";
}

function tipoDe(dados: unknown): string {
  const t = dados && typeof dados === "object" ? (dados as Record<string, unknown>).Tipo : "";
  return typeof t === "string" ? t.trim() : "";
}

portalPrevidenciarioPublicRouter.get("/:slug/transparencia-api/:codigo", async (req, res, next) => {
  try {
    const pagina = resolverPagina(req.params.codigo);
    if (!pagina) throw new HttpError(404, "Página não encontrada.");
    const tenant = await prisma.tenant.findUnique({ where: { slug: req.params.slug }, select: { id: true } });
    if (!tenant) throw new HttpError(404, "RPPS não encontrado.");

    const corpo = await cacheIndicadores(`napi|${tenant.id}|${req.params.codigo}`, async () => {
      let registros = await prisma.transparenciaApiRegistro.findMany({
        where: { tenantId: tenant.id, endpoint: pagina.endpoint, removidoEm: null },
        orderBy: [{ referencia: "desc" }, { coletadoEm: "asc" }],
        select: { dados: true, ano: true, referencia: true, coletadoEm: true },
      });
      let titulo = pagina.titulo;
      if (pagina.tipoSlug) {
        registros = registros.filter((r) => slugDoTipo(tipoDe(r.dados)) === pagina.tipoSlug);
        if (registros.length === 0) return null;
        titulo = tituloAmigavel(tipoDe(registros[0].dados));
      }
      if (pagina.colegiado) {
        const { id, tipo } = pagina.colegiado;
        registros = registros.filter((r) => campoTexto(r.dados, "ColegiadoId") === id && (tipo === null || campoTexto(r.dados, "TipoDocumentoId") === tipo));
        if (registros.length === 0) return null;
        const nome = tituloAmigavel(campoTexto(registros[0].dados, "Colegiado"));
        titulo = tipo === null ? nome : `${nome} — ${campoTexto(registros[0].dados, "TipoDocumento")}`;
      }

      // links de PDF/anexo: onde já temos a cópia, aponta pro nosso arquivo (não pro servidor de origem)
      const copias = await prisma.transparenciaApiArquivo.findMany({
        where: { tenantId: tenant.id },
        select: { id: true, urlHash: true, status: true, erro: true, tentativas: true },
      });
      const idPorHash = new Map(copias.filter((c) => c.status === "OK").map((c) => [c.urlHash, c.id]));
      // link que a origem nunca vai servir (erro 4xx depois de todas as tentativas): esconde o botão em vez de
      // mostrar um link quebrado — é erro de cadastro lá na fonte, não algo que a gente resolva
      const quebrados = new Set(copias.filter((c) => c.status === "FALHA" && c.tentativas >= 5 && /^HTTP 4\d\d/.test(c.erro ?? "")).map((c) => c.urlHash));
      // URL que termina em "/" é uma pasta, não um arquivo (ex.: anexo cadastrado sem escolher o arquivo)
      const ehPasta = (url: string) => {
        try {
          return new URL(url).pathname.endsWith("/");
        } catch {
          return false;
        }
      };
      const comLinksNossos = (dados: Record<string, unknown>) => {
        const saida = { ...dados };
        for (const l of camposDeLink(dados)) {
          const hash = hashUrl(l.url);
          const id = idPorHash.get(hash);
          if (id) saida[l.campo] = `/api/public/portal-previdenciario/${req.params.slug}/transparencia-api/arquivos/${id}`;
          else if (ehPasta(l.url) || quebrados.has(hash)) saida[l.campo] = null;
        }
        return saida;
      };
      return {
        codigo: req.params.codigo,
        titulo,
        atualizadoEm: registros.reduce<Date | null>((m, r) => (!m || r.coletadoEm > m ? r.coletadoEm : m), null),
        registros: registros.map((r) => ({ ...comLinksNossos(r.dados as Record<string, unknown>), _ano: r.ano, _referencia: r.referencia })),
      };
    });
    if (!corpo) throw new HttpError(404, "Página não encontrada.");
    res.json(corpo);
  } catch (err) {
    next(err);
  }
});

// Índice das páginas que este cliente tem (com quantos registros cada uma): serve de base para montar os
// botões do site do órgão e para conferir o que foi coletado.
portalPrevidenciarioPublicRouter.get("/:slug/transparencia-api", async (req, res, next) => {
  try {
    const tenant = await prisma.tenant.findUnique({ where: { slug: req.params.slug }, select: { id: true } });
    if (!tenant) throw new HttpError(404, "RPPS não encontrado.");

    const corpo = await cacheIndicadores(`napi-indice|${tenant.id}`, async () => {
      const grupos = await prisma.transparenciaApiRegistro.groupBy({
        by: ["endpoint"],
        where: { tenantId: tenant.id, removidoEm: null },
        _count: { _all: true },
      });
      const total = new Map(grupos.map((g) => [g.endpoint, g._count._all]));

      const paginas: { codigo: string; titulo: string; total: number; origem: "nexa" | "portal" | "portal-tipo" | "portal-colegiado" }[] = [];
      for (const e of CATALOGO_TRANSPARENCIA_API) if (total.get(e.codigo)) paginas.push({ codigo: e.codigo, titulo: e.titulo, total: total.get(e.codigo)!, origem: "nexa" });
      for (const p of CATALOGO_PORTAL) if (total.get(p.endpoint)) paginas.push({ codigo: p.codigo, titulo: p.titulo, total: total.get(p.endpoint)!, origem: "portal" });

      const pubs = await prisma.transparenciaApiRegistro.findMany({
        where: { tenantId: tenant.id, endpoint: ENDPOINT_PUBLICACOES, removidoEm: null },
        select: { dados: true },
      });
      const porTipo = new Map<string, { titulo: string; total: number }>();
      for (const r of pubs) {
        const tipo = tipoDe(r.dados);
        if (!tipo) continue;
        const slug = slugDoTipo(tipo);
        const atual = porTipo.get(slug) ?? { titulo: tituloAmigavel(tipo), total: 0 };
        atual.total++;
        porTipo.set(slug, atual);
      }
      for (const [slug, v] of [...porTipo.entries()].sort((a, b) => a[1].titulo.localeCompare(b[1].titulo, "pt-BR"))) {
        paginas.push({ codigo: `${PREFIXO_PUBLICACAO}${slug}`, titulo: v.titulo, total: v.total, origem: "portal-tipo" });
      }

      // documentos dos colegiados: uma página por colegiado e uma por (colegiado, tipo de documento)
      const docs = await prisma.transparenciaApiRegistro.findMany({
        where: { tenantId: tenant.id, endpoint: ENDPOINT_COLEGIADOS, removidoEm: null },
        select: { dados: true },
      });
      const porColegiado = new Map<string, { nome: string; total: number }>();
      const porCombo = new Map<string, { titulo: string; total: number }>();
      for (const r of docs) {
        const id = campoTexto(r.dados, "ColegiadoId");
        const tipo = campoTexto(r.dados, "TipoDocumentoId");
        if (!id) continue;
        const nome = tituloAmigavel(campoTexto(r.dados, "Colegiado"));
        const g = porColegiado.get(id) ?? { nome, total: 0 };
        g.total++;
        porColegiado.set(id, g);
        const c = porCombo.get(`${id}-${tipo}`) ?? { titulo: `${nome} — ${campoTexto(r.dados, "TipoDocumento")}`, total: 0 };
        c.total++;
        porCombo.set(`${id}-${tipo}`, c);
      }
      for (const [id, g] of [...porColegiado.entries()].sort((a, b) => a[1].nome.localeCompare(b[1].nome, "pt-BR"))) {
        paginas.push({ codigo: `${PREFIXO_COLEGIADO}${id}`, titulo: `${g.nome} — todos os documentos`, total: g.total, origem: "portal-colegiado" });
      }
      for (const [chave, c] of [...porCombo.entries()].sort((a, b) => a[1].titulo.localeCompare(b[1].titulo, "pt-BR"))) {
        paginas.push({ codigo: `${PREFIXO_COLEGIADO}${chave}`, titulo: c.titulo, total: c.total, origem: "portal-colegiado" });
      }
      return { paginas };
    });
    res.json(corpo);
  } catch (err) {
    next(err);
  }
});
// Serve a nossa cópia de um PDF/anexo da API Nexa (só se pertencer a este RPPS e estiver baixado).
portalPrevidenciarioPublicRouter.get("/:slug/transparencia-api/arquivos/:id", async (req, res, next) => {
  try {
    const tenant = await prisma.tenant.findUnique({ where: { slug: req.params.slug }, select: { id: true } });
    if (!tenant) throw new HttpError(404, "RPPS não encontrado.");
    const arq = await prisma.transparenciaApiArquivo.findFirst({ where: { id: req.params.id, tenantId: tenant.id, status: "OK" } });
    if (!arq?.conteudo) throw new HttpError(404, "Arquivo não encontrado.");
    res.setHeader("Content-Type", arq.mime ?? "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${(arq.nome ?? "arquivo.pdf").replace(/["\\\r\n]/g, "")}"`);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(Buffer.from(arq.conteudo));
  } catch (err) {
    next(err);
  }
});

// Serve o PDF original que deu origem a um valor publicado — só se esse `uploadId` for realmente
// a origem de algum valor JÁ PUBLICADO deste documento/tenant (nunca serve um upload qualquer só
// porque alguém adivinhou o id: uploads podem conter rascunhos não publicados de outros
// documentos/execuções, que não são pra ser públicos).
portalPrevidenciarioPublicRouter.get("/:slug/documentos/:codigo/arquivos/:uploadId", async (req, res, next) => {
  try {
    const tenant = await prisma.tenant.findUnique({ where: { slug: req.params.slug } });
    if (!tenant) throw new HttpError(404, "RPPS não encontrado.");

    const docPersonalizado = await prisma.documentoPersonalizado.findUnique({
      where: { codigo: req.params.codigo },
    });
    if (!docPersonalizado || !docPersonalizado.ativo || !docPersonalizado.portalDocumentoId) {
      throw new HttpError(404, "Documento não encontrado.");
    }

    const referenciado = await prisma.tenantPortalIndicadorValor.findFirst({
      where: {
        tenantId: tenant.id,
        documentoUploadId: req.params.uploadId,
        indicador: { documentoId: docPersonalizado.portalDocumentoId },
      },
    });
    if (!referenciado) throw new HttpError(404, "Arquivo não encontrado.");

    const upload = await prisma.documentoUpload.findUnique({ where: { id: req.params.uploadId } });
    if (!upload || upload.tenantId !== tenant.id) throw new HttpError(404, "Arquivo não encontrado.");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${upload.nomeArquivo.replace(/["\\]/g, "")}"`);

    const caminhoAbsoluto = path.resolve(upload.caminhoArquivo);
    if (fs.existsSync(caminhoAbsoluto)) {
      res.sendFile(caminhoAbsoluto);
      return;
    }

    // Arquivo não está em disco neste ambiente (ex.: upload que "viajou" de outro ambiente só via
    // SQL) — cai pra cópia guardada no banco, se houver (ver DocumentoUpload.conteudoArquivo).
    if (upload.conteudoArquivo) {
      res.send(Buffer.from(upload.conteudoArquivo));
      return;
    }

    throw new HttpError(404, "Arquivo não encontrado.");
  } catch (err) {
    next(err);
  }
});
