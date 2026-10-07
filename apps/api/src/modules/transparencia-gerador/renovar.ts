// Cadastro de portal só pelas APIs de dados abertos (transparência + menu) e renovação de portais já
// cadastrados: consulta de novo a origem (link ou APIs), traz o que mudou e grava. Como o modelo (layout e
// funcionalidades) é um só e os portais são montados a partir dele na hora de ver ou baixar o ZIP, renovar
// também faz o portal passar a usar o modelo mais recente.

import { createHash } from "node:crypto";
import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";
import {
  apiUrlDe, baixarJson, configModelo, importarPortal, normalizarApiUrl, slug, testarTransparencia, type ArquivoEnviado,
} from "./gerador.service";
import { extrairDaPagina, hostsCitados, importarPorLink, lerCores, lerIdentidade, type Anterior, type ResultadoLink } from "./importar-link";
import { fetchPagina, hostPermitido } from "./http";
import { coresDaLogo } from "./cores-logo";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cfg = Record<string, any>;

const ehMenu = (d: unknown) => Array.isArray(d) && d.length > 0 && typeof d[0] === "object" && d[0] !== null && "Nome" in d[0];

/** Página inicial do órgão: o item "início" do menu (ou, com `aproximado`, o site mais citado pelos links do menu). */
export function siteDoMenu(menu: Cfg[], aproximado = true): string {
  const http = (s: unknown) => (typeof s === "string" && /^https?:\/\//i.test(s.trim()) ? s.trim() : "");
  const raizes = menu.filter((m) => !m?.NMenu && http(m?.Pagina)).sort((a, b) => (Number(a.Ordem) || 0) - (Number(b.Ordem) || 0));
  const inicio = raizes.find((m) => /^\s*([ií]n[ií]cio|home|p[aá]gina inicial)\s*$/i.test(String(m.Nome)));
  if (inicio) return http(inicio.Pagina);
  if (!aproximado) return "";
  const host = hostsCitados(menu)[0];
  return host ?? "";
}

export async function importarPorApis(
  entrada: { urlTransparencia?: string; urlMenu?: string; pasta?: string; nome?: string; site?: string },
  base?: Cfg,
  anterior?: Anterior,
): Promise<ResultadoLink> {
  const urlT0 = (entrada.urlTransparencia ?? "").trim();
  const urlM0 = (entrada.urlMenu ?? "").trim();
  if (urlT0 === "" && urlM0 === "") throw new HttpError(400, "Informe a API de transparência (e, se tiver, a do menu).");
  const avisos: string[] = [];

  const t = await testarTransparencia(urlT0 || urlM0);
  if (!t.ok || !t.total) throw new HttpError(400, `API de transparência: ${"erro" in t && t.erro ? t.erro : "não devolveu nenhum item."}`);
  const urlT = t.url!;

  // menu: o link informado; sem ele, o mesmo servidor da transparência
  const urlM = normalizarApiUrl(urlM0 || urlT.replace(/^(https?:\/\/[^/]+).*$/, "$1"), "menu");
  const menuBaixado = await baixarJson(urlM);
  const menu = (menuBaixado.data ?? []) as Cfg[];
  if (menuBaixado.data === null || (menu.length > 0 && !ehMenu(menu))) {
    avisos.push(`Não consegui ler a API do menu (${menuBaixado.erro || "formato inesperado"}): o portal ficará sem barra de menu até ela responder.`);
  }
  const menuOk = menuBaixado.data !== null && ehMenu(menu);

  const itens = ((await baixarJson(urlT)).data ?? []) as Cfg[];
  const cacheTransparencia = JSON.stringify(itens);
  const cacheMenu = menuOk ? JSON.stringify(menu) : (anterior?.cacheMenu ?? undefined);

  // identidade (nome, logo, cores, contatos): vem do site do órgão (item "Início" do menu) ou, se ele não
  // trouxer nome e logo, da própria página de acesso à informação do servidor da API
  const origemApi = t.url!.replace(/^(https?:\/\/[^/]+).*$/, "$1");
  const inicio = (entrada.site ?? "").trim() || siteDoMenu(menu, false);
  // sem item "Início", o servidor da API só entra por último: a raiz dele costuma ser uma página genérica da plataforma
  const siteMenu = inicio || siteDoMenu(menu);
  const candidatos = [inicio, t.paginaOficial, `${origemApi}/acessoainformacao`, siteMenu]
    .map((u) => (u && !/^https?:\/\//i.test(u) ? `https://${u}` : u))
    .filter((u, i, a) => u && hostPermitido(u) && a.indexOf(u) === i);
  let siteUrl = siteMenu;
  let x = null as ReturnType<typeof extrairDaPagina> | null;
  let melhor = -1;
  const lidasUrls = new Set<string>();
  for (const u of candidatos) {
    const pagina = await fetchPagina(u);
    if (!pagina) continue;
    const e = extrairDaPagina(pagina.html, pagina.url);
    lidasUrls.add(u);
    // o logo precisa vir de uma <img> da página (og:image sozinho costuma ser imagem de compartilhamento genérica)
    const pontos = (e.nome ? 1 : 0) + (e.logoUrl && e.logoImg ? 2 : 0);
    if (pontos > melhor) {
      melhor = pontos;
      x = e;
      siteUrl = inicio || u;
    }
    if (pontos >= 3) break;
  }
  const ident = x ? await lerIdentidade(x) : null;
  // a página escolhida pelo nome/logo pode não declarar cores: tenta as demais páginas do mesmo órgão
  if (ident && !ident.corPrimaria) {
    for (const u of candidatos) {
      if (lidasUrls.has(u)) continue;
      const pg = await fetchPagina(u);
      if (!pg) continue;
      const c = await lerCores(extrairDaPagina(pg.html, pg.url));
      if (c.corPrimaria) {
        ident.corPrimaria = c.corPrimaria;
        ident.corDestaque = c.corDestaque;
        break;
      }
    }
  }
  if (!x) avisos.push("Não consegui abrir o site do órgão nem a página de acesso à informação: nome, logo e cores precisam ser conferidos no portal.");

  let nome: string = (entrada.nome ?? "").trim() || x?.nome || (typeof base?.cliente?.nome === "string" ? base.cliente.nome : "");
  let nomeCompleto: string = x?.nomeCompleto ?? "";
  // "Nome por extenso - SIGLA" ou "SIGLA - Nome por extenso": a sigla vira o nome curto
  const ehSigla = (s: string) => /^[A-Z0-9][A-Z0-9.]{1,11}$/.test(s.trim());
  if (!(entrada.nome ?? "").trim() && x && ehSigla(x.nomeCompleto) && x.nomeCompleto !== x.nome) {
    nomeCompleto = x.nome; // o alt veio "Nome por extenso - SIGLA": a ordem é a inversa da esperada
    nome = x.nomeCompleto;
  }
  const partes = nome.split(/\s+[—–-]\s+/);
  const sigla = partes.length > 1 ? partes.find(ehSigla) : undefined;
  if (sigla) {
    nomeCompleto = nomeCompleto && nomeCompleto !== nome ? nomeCompleto : partes.filter((p) => p !== sigla).join(" — ");
    nome = sigla.trim();
  }
  if (nome === "") throw new HttpError(400, "Não consegui descobrir o nome do órgão pelo site. Informe o nome para cadastrar.");
  const config: Cfg = structuredClone(base ?? configModelo());
  config.api = {
    ...(config.api ?? {}), base: origemApi, urlTransparencia: urlT, urlMenu: urlM,
    transparencia: true, menu: menuOk, dominioLinks: t.dominioLinks, paginaOficial: t.paginaOficial,
  };
  const cacheOrdem = t.paginaOficial ? JSON.stringify(t.ordem) : (anterior?.cacheOrdem ?? undefined);
  config.grupos = { ...(config.grupos ?? {}), ...(cacheOrdem ? { ordemAutomatica: true } : {}) };

  config.cliente = {
    ...config.cliente,
    nome,
    nomeCompleto: nomeCompleto || config.cliente?.nomeCompleto || nome,
    site: inicio || x?.site || config.cliente?.site || "",
    cnpj: x?.cnpj || config.cliente?.cnpj || "", endereco: x?.endereco || config.cliente?.endereco || "",
    telefone: x?.telefone || config.cliente?.telefone || "", email: x?.email || config.cliente?.email || "",
    redes: x?.redes.length ? x.redes : (config.cliente?.redes ?? []),
  };
  const daLogo = !ident?.corPrimaria && ident?.logo ? coresDaLogo(ident.logo.buffer) : null;
  if (ident?.corPrimaria) config.cores = { ...config.cores, primaria: ident.corPrimaria, destaque: ident.corDestaque ?? config.cores?.destaque };
  else if (daLogo) config.cores = { ...config.cores, ...daLogo };
  else if (x) avisos.push("Não consegui ler as cores do site nem da logo: foram mantidas as cores padrão.");
  if (x) {
    config.seo = { ...(config.seo ?? {}), url: x.seoUrl || siteUrl, descricao: x.descricao || config.seo?.descricao || "" };
    if (x.titulo) config.textos = { ...config.textos, titulo: x.titulo };
  }
  config.externo = { origem: "apis", url: siteUrl || "", apis: { transparencia: urlT, menu: urlM }, importadoEm: new Date().toISOString() };

  const logo = ident?.logo ?? anterior?.logo;
  const icone = ident?.icone ?? anterior?.icone;

  const pasta = slug(entrada.pasta?.trim() ? entrada.pasta : nome);
  const existente = await prisma.transparenciaPortal.findUnique({ where: { pasta }, select: { config: true } });
  if (existente && !(existente.config as Cfg | null)?.externo) {
    throw new HttpError(400, `Já existe um portal "${pasta}" criado no gerador. Informe outro nome de pasta para cadastrar estas APIs.`);
  }

  const r = await importarPortal({ pasta, config, logo, icone, cacheTransparencia, cacheMenu, cacheOrdem });
  const grupos = new Set(itens.map((i) => i?.Grupo)).size;
  return {
    pasta: r.pasta, novo: r.novo, avisos: [...avisos, ...r.avisos],
    resumo: { nome, itens: itens.length, grupos, menu: menu.length, api: config.api.base, logo: !!logo, cores: !!(ident?.corPrimaria || daLogo) },
  };
}

/* ---------- renovação ---------- */

export interface ResultadoRenovacao {
  pasta: string;
  nome: string;
  ok: boolean;
  alterado: boolean;
  mudancas: string[];
  avisos: string[];
  erro?: string;
}

const chaveItem = (i: Cfg) => `${i?.Id ?? ""}|${i?.Grupo ?? ""}|${i?.Descricao ?? ""}`;
const hash = (b: Uint8Array | null | undefined) => (b ? createHash("sha1").update(b).digest("hex") : "");

function lista(txt: string | null | undefined): Cfg[] {
  try {
    const d = txt ? JSON.parse(txt) : [];
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}

function diffLista(rotulo: string, antes: Cfg[], depois: Cfg[], k: (i: Cfg) => string, nomeDe: (i: Cfg) => string): string[] {
  const a = new Map(antes.map((i) => [k(i), i]));
  const d = new Map(depois.map((i) => [k(i), i]));
  const novos = [...d.keys()].filter((x) => !a.has(x));
  const sumiram = [...a.keys()].filter((x) => !d.has(x));
  const out: string[] = [];
  const exemplos = (ks: string[], m: Map<string, Cfg>) => ks.slice(0, 3).map((x) => nomeDe(m.get(x)!)).join(", ") + (ks.length > 3 ? "…" : "");
  if (novos.length) out.push(`${rotulo}: +${novos.length} (${exemplos(novos, d)})`);
  if (sumiram.length) out.push(`${rotulo}: −${sumiram.length} (${exemplos(sumiram, a)})`);
  return out;
}

export async function renovarPortal(pastaEntrada: string): Promise<ResultadoRenovacao> {
  const pasta = slug(pastaEntrada);
  const antes = await prisma.transparenciaPortal.findUnique({ where: { pasta } });
  if (!antes) throw new HttpError(404, "Cliente não encontrado.");
  const config = antes.config as Cfg;

  const arq = (nome: string | null, dados: Uint8Array | null): ArquivoEnviado | undefined =>
    nome && dados ? { nome, buffer: Buffer.from(dados) } : undefined;
  const anterior: Anterior = {
    logo: arq(antes.logoNome, antes.logoDados as Uint8Array | null),
    icone: arq(antes.iconeNome, antes.iconeDados as Uint8Array | null),
    cacheTransparencia: antes.cacheTransparencia, cacheMenu: antes.cacheMenu, cacheOrdem: antes.cacheOrdem,
  };
  const ext = config?.externo as Cfg | undefined;
  const avisos: string[] = [];

  if (ext?.origem === "apis" && ext.apis?.transparencia) {
    avisos.push(...(await importarPorApis({ urlTransparencia: ext.apis.transparencia, urlMenu: ext.apis.menu, pasta, site: ext.url }, structuredClone(config), anterior)).avisos);
  } else if (typeof ext?.url === "string" && ext.url) {
    avisos.push(...(await importarPorLink(ext.url, pasta, structuredClone(config), anterior)).avisos);
  } else {
    // portal feito no gerador: só atualiza a cópia dos dados a partir das APIs configuradas
    const api = config?.api ?? {};
    const urlT = apiUrlDe(api, "transparencia");
    const urlM = apiUrlDe(api, "menu");
    if (!urlT && !urlM) throw new HttpError(400, "Este portal não tem API configurada para renovar.");
    const dados: Cfg = {};
    if (urlT) {
      const t = await testarTransparencia(urlT);
      if (t.ok && t.total) {
        const b = await baixarJson(t.url!);
        if (b.raw) dados.cacheTransparencia = b.raw;
        if (t.paginaOficial) dados.cacheOrdem = JSON.stringify(t.ordem);
      } else avisos.push(`API de transparência não respondeu (${"erro" in t ? t.erro : "sem itens"}): mantive a cópia anterior.`);
    }
    if (urlM) {
      const b = await baixarJson(urlM);
      if (b.raw) dados.cacheMenu = b.raw;
      else avisos.push(`API do menu não respondeu (${b.erro}): mantive a cópia anterior.`);
    }
    if (Object.keys(dados).length) await prisma.transparenciaPortal.update({ where: { pasta }, data: dados });
  }

  const depois = await prisma.transparenciaPortal.findUnique({ where: { pasta } });
  if (!depois) throw new HttpError(500, "O portal sumiu durante a renovação.");
  const cfgD = depois.config as Cfg;

  const mudancas: string[] = [
    ...diffLista("Itens da transparência", lista(antes.cacheTransparencia), lista(depois.cacheTransparencia), chaveItem, (i) => String(i?.Descricao ?? i?.Id)),
    ...diffLista("Menu", lista(antes.cacheMenu), lista(depois.cacheMenu), (i) => `${i?.Id}|${i?.Nome}|${i?.Pagina}`, (i) => String(i?.Nome ?? i?.Id)),
  ];
  const campos: [string, unknown, unknown][] = [
    ["Nome", antes.nome, depois.nome], ["Cor principal", config?.cores?.primaria, cfgD?.cores?.primaria],
    ["Cor de destaque", config?.cores?.destaque, cfgD?.cores?.destaque], ["Site", config?.cliente?.site, cfgD?.cliente?.site],
    ["Telefone", config?.cliente?.telefone, cfgD?.cliente?.telefone], ["E-mail", config?.cliente?.email, cfgD?.cliente?.email],
    ["Endereço", config?.cliente?.endereco, cfgD?.cliente?.endereco],
  ];
  for (const [n, a, d] of campos) if ((a ?? "") !== (d ?? "")) mudancas.push(`${n}: ${a || "—"} → ${d || "—"}`);
  if (hash(antes.logoDados as Uint8Array | null) !== hash(depois.logoDados as Uint8Array | null)) mudancas.push("Logo atualizado");
  if (hash(antes.iconeDados as Uint8Array | null) !== hash(depois.iconeDados as Uint8Array | null)) mudancas.push("Ícone atualizado");

  return { pasta, nome: depois.nome, ok: true, alterado: mudancas.length > 0, mudancas, avisos };
}

/** Renova todos os portais, um de cada vez (não sobrecarrega os sites dos clientes) e sem parar no primeiro erro. */
export async function renovarTodos(): Promise<ResultadoRenovacao[]> {
  const todos = await prisma.transparenciaPortal.findMany({ select: { pasta: true, nome: true }, orderBy: { nome: "asc" } });
  const out: ResultadoRenovacao[] = [];
  for (const p of todos) {
    try {
      out.push(await renovarPortal(p.pasta));
    } catch (err) {
      out.push({ pasta: p.pasta, nome: p.nome, ok: false, alterado: false, mudancas: [], avisos: [], erro: err instanceof Error ? err.message : "Falha ao renovar." });
    }
  }
  return out;
}
