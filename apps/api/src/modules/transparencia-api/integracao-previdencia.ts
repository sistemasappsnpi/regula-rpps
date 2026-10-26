import { prisma } from "../../db/prisma";
import { env } from "../../config/env";
import { criarCache } from "../../middleware/publicProtect";
import { CATALOGO_PORTAL, CATALOGO_TRANSPARENCIA_API, ENDPOINT_COLEGIADOS, ENDPOINT_PUBLICACOES, PREFIXO_COLEGIADO, PREFIXO_PUBLICACAO, slugDoTipo } from "./catalogo";
import { urlPortalBase } from "./fontes";

// Integra a "transparência modelo" (o portal montado pelo gerador, ex.: /public/transparencia-portal/ipres/) com as
// páginas do Portal Previdenciário: cada botão cujo conteúdo já temos copiado aqui passa a abrir a nossa página
// (/portal-previdenciario/<slug>/<página>); o que nenhuma fonte entrega continua com o link original do órgão.
//
// Liga-se por portal, em TransparenciaPortal.config.integracaoPrevidencia = { "slug": "<slug do cliente>" }.
// O portal oficial do órgão não é tocado: só o JSON de botões que ESTE portal serve é reescrito, na hora de servir.

type Botao = Record<string, unknown>;

export interface Contexto {
  slug: string;
  base: string | null; // origem do portal de transparência do órgão (para descobrir o nome de uma categoria)
  paginas: Set<string>; // códigos de página que têm pelo menos 1 registro copiado
}

const cacheContexto = criarCache<Contexto | null>(60_000);
const cacheCategoria = criarCache<string | null>(24 * 60 * 60_000);

async function carregarContexto(slugCliente: string): Promise<Contexto | null> {
  const tenant = await prisma.tenant.findUnique({ where: { slug: slugCliente }, select: { id: true, portalMenuApiUrl: true } });
  if (!tenant) return null;

  const grupos = await prisma.transparenciaApiRegistro.groupBy({
    by: ["endpoint"],
    where: { tenantId: tenant.id, removidoEm: null },
    _count: { _all: true },
  });
  const total = new Map(grupos.map((g) => [g.endpoint, g._count._all]));

  const paginas = new Set<string>();
  for (const e of CATALOGO_TRANSPARENCIA_API) if (total.get(e.codigo)) paginas.add(e.codigo);
  for (const p of CATALOGO_PORTAL) if (total.get(p.endpoint)) paginas.add(p.codigo);

  const pubs = await prisma.transparenciaApiRegistro.findMany({
    where: { tenantId: tenant.id, endpoint: ENDPOINT_PUBLICACOES, removidoEm: null },
    select: { dados: true },
  });
  for (const r of pubs) {
    const t = r.dados && typeof r.dados === "object" ? (r.dados as Record<string, unknown>).Tipo : "";
    if (typeof t === "string" && t.trim()) paginas.add(`${PREFIXO_PUBLICACAO}${slugDoTipo(t)}`);
  }
  // documentos dos colegiados: col-<id> e col-<id>-<tipo>
  const colegiados = await prisma.transparenciaApiRegistro.findMany({
    where: { tenantId: tenant.id, endpoint: ENDPOINT_COLEGIADOS, removidoEm: null },
    select: { dados: true },
  });
  for (const r of colegiados) {
    const d = r.dados && typeof r.dados === "object" ? (r.dados as Record<string, unknown>) : {};
    const id = typeof d.ColegiadoId === "string" ? d.ColegiadoId : "";
    const tipo = typeof d.TipoDocumentoId === "string" ? d.TipoDocumentoId : "";
    if (id) {
      paginas.add(`${PREFIXO_COLEGIADO}${id}`);
      if (tipo) paginas.add(`${PREFIXO_COLEGIADO}${id}-${tipo}`);
    }
  }
  return { slug: slugCliente, base: urlPortalBase(tenant.portalMenuApiUrl), paginas };
}

// "https://portal/publicacoes?cat=80" -> "ACÓRDÃOS TCE" (a página de categoria diz o nome em og:description)
async function nomeDaCategoria(base: string, cat: string): Promise<string | null> {
  return cacheCategoria(`${base}|${cat}`, async () => {
    try {
      const resp = await fetch(`${base}/publicacoes?cat=${encodeURIComponent(cat)}`, { signal: AbortSignal.timeout(8000) });
      if (!resp.ok) return null;
      const html = await resp.text();
      const m = html.match(/og:description"\s+content="Lista de ([^"]+)"/i);
      return m ? m[1].trim() : null;
    } catch {
      return null;
    }
  });
}

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

// Botões que o portal separa por subgrupo (que a API não traz) e que aqui caem numa página maior: abrem a página
// já pesquisada pelo assunto (?q=). Chave: descrição do botão sem acento/caixa.
const REFINAMENTOS: Record<string, { pagina: string; q: string }> = {
  alm: { pagina: "pub-investimentos", q: "alm" },
  "cronograma mensal das atividades de investimentos": { pagina: "pub-investimentos", q: "plano ação mensal" },
  "relatorio semestral de diligencia": { pagina: "pub-investimentos", q: "diligência" },
  "relatorios de investimentos": { pagina: "pub-investimentos", q: "relatório de investimentos" },
  "estrut organizacional": { pagina: "publicacoes", q: "estrutura organizacional" },
  "seminarios convites": { pagina: "noticias", q: "seminário" },
};

// 1ª fonte: a API Nexa. Nome do botão (ou da categoria de publicação para a qual ele aponta), sem acento/caixa -> página
// da Nexa. Vale só se aquela página tem registros copiados; senão o botão cai para os dados abertos e, por fim, ao link original.
const NEXA_POR_NOME: Record<string, string> = {
  "acordaos tce": "acordaos-tce",
  "audiencias publicas": "audiencia-publica",
  "cartilha previdenciaria": "cartilha-previdenciaria",
  "cronograma das acoes de educacao previdenciaria": "acoes-educacao",
  "avaliacao atuarial": "avaliacao-atuarial",
  crp: "crp",
  "certificado de regularidade previdenciaria": "crp",
  "codigo de etica": "codigo-etica",
  "limite de alcadas": "limite-alcada",
  "limites de alcadas": "limite-alcada",
  "pai politica de investimentos": "politica-investimento",
  "politica anual de investimentos": "politica-investimento",
  "politica de investimentos": "politica-investimento",
  planejamento: "plano-acao-anual",
  "planos de acao anual": "plano-acao-anual",
  "demonstrativos financeiros e conatabeis": "demonstracoes-financeiras",
  "demonstracoes financeiras e contabeis": "demonstracoes-financeiras",
  "relacao de entidades credenciadas investimentos": "entidades-credenciadas",
  "instituicoes cadastradas e credenciadas": "entidades-credenciadas",
  "relatorios de investimentos": "relatorio-investimentos",
  certidoes: "certidoes-negativas",
  "certidoes negativas": "certidoes-negativas",
};

function paginaNexa(nome: string, ctx: Contexto): string | null {
  const codigo = NEXA_POR_NOME[norm(nome)];
  return codigo && ctx.paginas.has(codigo) ? codigo : null;
}

// Caminho (sem barras) do link do botão -> página da Previdência
function paginaPorCaminho(caminho: string): string | null {
  if (/^diarias$/.test(caminho)) return "diarias";
  if (/^obras$/.test(caminho)) return "obras";
  if (/^(pessoal|quadrodepessoal)$/.test(caminho)) return "quadro-de-pessoal";
  if (/^(licitacoes?|portalcompras)$/.test(caminho)) return "licitacoes";
  if (/^contratos?$/.test(caminho)) return "contratos";
  if (caminho === "leis") return "leis";
  if (/^portarias?$/.test(caminho)) return "portarias";
  if (caminho === "lrf") return "lrf";
  if (/^(informa|noticias)$/.test(caminho)) return "noticias";
  if (caminho === "conselhos") return "conselhos";
  if (caminho === "processoseletivo") return "processos-seletivos";
  if (caminho === "concursopublico" || caminho === "concursopublico.php") return "concursos-publicos";
  if (/^(servicos\.php|servicosonline)$/.test(caminho)) return "servicos-online";
  if (caminho === "contatos") return "gestao-e-atendimento";
  if (caminho === "selos") return "selos";
  if (caminho === "decretos") return "decretos";
  if (caminho === "pcsg") return "prestacao-de-contas";
  if (caminho === "perguntaserespostas") return "perguntas-frequentes";
  if (caminho === "glossario") return "glossario";
  if (caminho === "processoprevidenciario") return "transparencia-de-beneficios";
  return null;
}

// A API às vezes devolve o domínio duplicado ("https://x/https://y/…"), barras dobradas ou um caminho relativo
// ("concursopublico.php"): devolve o endereço certo, ou o texto como veio se não der para interpretar.
export function limparLink(original: string, base: string | null): string {
  const t = original.trim();
  if (!t) return "";
  const semDuplicado = t.replace(/^(https?:\/\/[^/]+)\/+(https?:\/\/)/i, "$2");
  try {
    const u = new URL(semDuplicado, base ? `${base}/` : undefined);
    if (u.protocol !== "http:" && u.protocol !== "https:") return t;
    u.pathname = u.pathname.replace(/\/{2,}/g, "/");
    return u.href;
  } catch {
    return t;
  }
}

// Ordem de decisão de cada botão: 1) API Nexa; 2) dados abertos do portal do órgão (as páginas copiadas dele);
// 3) nenhuma das duas tem -> null, e o botão continua com o link original.
export async function destinoDoBotao(b: Botao, ctx: Contexto): Promise<string | null> {
  const descricao = typeof b.Descricao === "string" ? b.Descricao : "";
  const original = typeof b.Link === "string" ? b.Link.trim() : "";

  const limpo = limparLink(original, ctx.base);
  let caminho = "";
  let cat = "";
  if (limpo) {
    try {
      const u = new URL(limpo, ctx.base ?? "https://exemplo.invalid");
      caminho = u.pathname.replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/").toLowerCase();
      cat = u.searchParams.get("cat") ?? "";
    } catch {
      return null;
    }
  } else if (norm(descricao) === "licitacoes") {
    // botão cadastrado sem link
    caminho = "licitacoes";
  }

  // documentos de colegiado: /conselhos/<id>?tipo=<tipo> (um tipo) ou /conselhos/<id> (todos)
  const colegiado = caminho.match(/^conselhos\/(\d+)$/);
  if (colegiado) {
    let tipoDoc = "";
    try {
      tipoDoc = new URL(limpo, ctx.base ?? "https://exemplo.invalid").searchParams.get("tipo") ?? "";
    } catch {
      tipoDoc = "";
    }
    const pagina = `${PREFIXO_COLEGIADO}${colegiado[1]}${tipoDoc ? `-${tipoDoc}` : ""}`;
    return ctx.paginas.has(pagina) ? pagina : null;
  }

  // 1) Nexa, pelo nome do botão
  const daNexa = paginaNexa(descricao, ctx);
  if (daNexa) return daNexa;

  const ref = REFINAMENTOS[norm(descricao)];
  if (ref && ctx.paginas.has(ref.pagina)) return `${ref.pagina}?q=${encodeURIComponent(ref.q)}`;

  if (caminho === "publicacoes") {
    if (!cat) return ctx.paginas.has("publicacoes") ? "publicacoes" : null;
    if (!ctx.base) return null;
    const nome = await nomeDaCategoria(ctx.base, cat);
    if (!nome) return null;
    // 1) Nexa, pelo nome da categoria; 2) a página do tipo de publicação, dos dados abertos
    const nexaDaCategoria = paginaNexa(nome, ctx);
    if (nexaDaCategoria) return nexaDaCategoria;
    const pagina = `${PREFIXO_PUBLICACAO}${slugDoTipo(nome)}`;
    return ctx.paginas.has(pagina) ? pagina : null;
  }

  const pagina = paginaPorCaminho(caminho);
  return pagina && ctx.paginas.has(pagina) ? pagina : null;
}

/**
 * Reescreve o link dos botões (lista do `d=transparencia`) que têm página equivalente na Previdência. Nunca falha:
 * qualquer problema devolve a lista original, e o botão sem equivalente fica com o link original do órgão.
 */
export async function integrarBotoes(raw: string, slugCliente: string): Promise<string> {
  try {
    const itens = JSON.parse(raw) as unknown;
    if (!Array.isArray(itens)) return raw;
    const ctx = await cacheContexto(slugCliente, () => carregarContexto(slugCliente));
    if (!ctx || ctx.paginas.size === 0) return raw;

    const raiz = env.webUrl.replace(/\/+$/, "");
    const saida: unknown[] = [];
    for (const item of itens) {
      if (!item || typeof item !== "object") {
        saida.push(item);
        continue;
      }
      const b = item as Botao;
      const destino = await destinoDoBotao(b, ctx).catch(() => null);
      if (destino) {
        saida.push({ ...b, LinkOriginal: b.Link ?? "", Link: `${raiz}/portal-previdenciario/${ctx.slug}/${destino}` });
        continue;
      }
      // sem página nossa: fica o link original, só consertado quando a API o devolve quebrado
      const original = typeof b.Link === "string" ? b.Link : "";
      const certo = limparLink(original, ctx.base);
      saida.push(certo && certo !== original.trim() ? { ...b, LinkOriginal: original, Link: certo } : b);
    }
    return JSON.stringify(saida);
  } catch {
    return raw;
  }
}
