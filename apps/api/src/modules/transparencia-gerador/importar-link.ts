// Cadastra, só pelo link, um portal da transparência que já existe fora do gerador: lê a página publicada
// (nome, logo, ícone, cores, contatos, redes), procura os dados (proxy.php / cache_*.json / snapshot embutido)
// e a API oficial, e guarda tudo como um portal do gerador — que também vira ZIP no modelo atual.

import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { baixarJson, configModelo, importarPortal, LIMITE_IMAGEM, normalizarApiUrl, slug, testarTransparencia, type ArquivoEnviado } from "./gerador.service";
import { fetchBytes, fetchPagina, fetchTexto, hostPermitido } from "./http";
import { limparTexto } from "./ordem";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cfg = Record<string, any>;

/* ---------- leitura do HTML (sem biblioteca: só o que a importação precisa) ---------- */

function atributos(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? "";
  return out;
}

function metas(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = atributos(m[0]);
    const k = (a.property || a.name || "").toLowerCase();
    if (k && a.content !== undefined && !(k in out)) out[k] = limparTexto(a.content);
  }
  return out;
}

function links(html: string): { rel: string; href: string }[] {
  return [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((m) => atributos(m[0]))
    .filter((a) => a.href)
    .map((a) => ({ rel: (a.rel || "").toLowerCase(), href: a.href }));
}

function absoluta(href: string, base: string): string {
  try {
    const u = new URL(href.trim(), base);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : "";
  } catch {
    return "";
  }
}

const hex6 = (c: string): string | null => {
  const m = c.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((x) => x + x).join("") : m[1];
  return `#${h.toLowerCase()}`;
};

function corDoCss(css: string, nome: string): string | null {
  const m = css.match(new RegExp(`--${nome}\\s*:\\s*(#[0-9a-fA-F]{3,6})\\b`));
  return m ? hex6(m[1]) : null;
}

const REDES: [string, RegExp][] = [
  ["youtube", /youtube\.com|youtu\.be/i], ["instagram", /instagram\.com/i], ["facebook", /facebook\.com|fb\.com/i], ["x", /(^|\/\/|\.)(x|twitter)\.com/i],
];

export interface PaginaExtraida {
  nome: string;
  nomeCompleto: string;
  site: string;
  seoUrl: string;
  descricao: string;
  titulo: string;
  corPrimaria: string | null;
  corDestaque: string | null;
  logoUrl: string;
  iconeUrl: string;
  cnpj: string;
  endereco: string;
  telefone: string;
  email: string;
  redes: { tipo: string; url: string }[];
  folhas: string[];
}

/** Extrai o que dá para saber de uma página de portal (mesmo layout do modelo, com alternativas para outros sites). */
export function extrairDaPagina(html: string, base: string): PaginaExtraida {
  const sem = html.replace(/<(script)\b[\s\S]*?<\/\1>/gi, "");
  const m = metas(sem);
  const ls = links(sem);

  const header = sem.match(/<header\b[\s\S]*?<\/header>/i)?.[0] ?? "";
  const img = header.match(/<img\b[^>]*>/i)?.[0] ?? sem.match(/<img\b[^>]*(?:logo|brasao)[^>]*>/i)?.[0] ?? "";
  const imgA = img ? atributos(img) : {};
  const altLogo = limparTexto(imgA.alt || "");
  // o modelo usa alt="Sigla — Nome completo"; em outros sites o alt costuma ser só o nome
  const [altCurto, ...altResto] = altLogo.split(/\s+[—–-]\s+/);
  const titulo = limparTexto(sem.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const nome = (/^https?:\/\//i.test(m["og:site_name"] ?? "") ? "" : m["og:site_name"]) || altCurto || titulo.split(/\s+[—–|-]\s+/).pop() || "";
  const nomeCompleto = altResto.join(" — ") || limparTexto(sem.match(/class="footer-brand-name"[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "").replace(new RegExp(`^${nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[-—–]\\s*`, "i"), "") || nome;

  const logoLink = header.match(/<a\b[^>]*class="[^"]*logo-link[^"]*"[^>]*>/i)?.[0] ?? header.match(/<a\b[^>]*>/i)?.[0] ?? "";
  const site = absoluta(atributos(logoLink).href || "", base);

  const icone = ls.find((l) => /(^|\s)icon(\s|$)/.test(l.rel) && !l.rel.includes("apple"))?.href ?? ls.find((l) => l.rel.includes("apple-touch-icon"))?.href ?? "";
  const canonical = ls.find((l) => l.rel === "canonical")?.href ?? m["og:url"] ?? "";

  // cores: variáveis do :root no CSS (inline ou nas folhas de estilo) ou a cor do tema do navegador
  const cssInline = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((x) => x[1]).join("\n");
  const folhas = ls.filter((l) => l.rel === "stylesheet").map((l) => absoluta(l.href, base)).filter((u) => u && !/fonts\.googleapis\.com/i.test(u));
  const corPrimaria = corDoCss(cssInline, "primary") ?? hex6(m["theme-color"] ?? "");
  const corDestaque = corDoCss(cssInline, "accent");

  const ctt = (cls: string) => [...sem.matchAll(new RegExp(`<ul\\b[^>]*class="[^"]*${cls}[^"]*"[^>]*>([\\s\\S]*?)</ul>`, "gi"))].flatMap((u) => [...u[1].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((li) => limparTexto(li[1])));
  const contatos = ctt("footer-contact");
  const cnpj = contatos.find((c) => /cnpj/i.test(c))?.replace(/^cnpj:?\s*/i, "") ?? "";
  const email = contatos.find((c) => /@/.test(c))?.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)?.[0] ?? "";
  const telefone = contatos.find((c) => /^\(?\d{2}\)?[\s.-]*\d{4,5}[\s.-]?\d{4}/.test(c) || /^0?800/.test(c)) ?? "";
  const endereco = contatos.find((c) => c !== telefone && !/cnpj|@/i.test(c)) ?? "";

  const redes: { tipo: string; url: string }[] = [];
  const social = sem.match(/<div\b[^>]*class="[^"]*footer-social[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "";
  for (const a of social.matchAll(/<a\b[^>]*>/gi)) {
    const at = atributos(a[0]);
    const url = absoluta(at.href || "", base);
    const tipo = REDES.find(([, re]) => re.test(url) || re.test(at["aria-label"] || ""))?.[0];
    if (tipo && !redes.some((r) => r.tipo === tipo)) redes.push({ tipo, url });
  }

  return {
    nome: nome.trim(), nomeCompleto: nomeCompleto.trim(), site, seoUrl: canonical ? absoluta(canonical, base) : "",
    descricao: m["description"] || m["og:description"] || "", titulo: limparTexto(sem.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1] ?? ""),
    corPrimaria, corDestaque, logoUrl: absoluta(imgA.src || m["og:image"] || "", base), iconeUrl: absoluta(icone, base),
    cnpj, endereco, telefone, email, redes, folhas,
  };
}

/* ---------- dados (listas da API) ---------- */

// lista JSON embutida na página (`var NOME = [...]`), com contagem de colchetes que respeita strings
export function listaEmbutida(html: string, nome: string): string | null {
  const ini = html.search(new RegExp(`\\b${nome}\\s*=\\s*\\[`));
  if (ini < 0) return null;
  const abre = html.indexOf("[", ini);
  let nivel = 0, emTexto = false;
  for (let i = abre; i < html.length; i++) {
    const c = html[i];
    if (emTexto) {
      if (c === "\\") i++;
      else if (c === '"') emTexto = false;
    } else if (c === '"') emTexto = true;
    else if (c === "[") nivel++;
    else if (c === "]" && --nivel === 0) return html.slice(abre, i + 1);
  }
  return null;
}

const ehTransparencia = (d: unknown) => Array.isArray(d) && d.length > 0 && typeof d[0] === "object" && d[0] !== null && "Grupo" in d[0] && "Descricao" in d[0];
const ehMenu = (d: unknown) => Array.isArray(d) && d.length > 0 && typeof d[0] === "object" && d[0] !== null && "Nome" in d[0];
const ehOrdem = (d: unknown) => Array.isArray(d) && d.length > 0 && typeof d[0] === "object" && d[0] !== null && "nome" in d[0] && Array.isArray((d[0] as Cfg).itens);

async function jsonDe(url: string, valida: (d: unknown) => boolean): Promise<string | null> {
  const t = await fetchTexto(url, 15000);
  if (t === null) return null;
  const raw = t.replace(/^﻿/, "");
  try {
    return valida(JSON.parse(raw)) ? raw : null;
  } catch {
    return null;
  }
}

async function primeiroValido(bases: string[], valida: (d: unknown) => boolean): Promise<string | null> {
  for (const u of bases) {
    const r = await jsonDe(u, valida);
    if (r) return r;
  }
  return null;
}

// hosts citados nos links dos itens, do mais frequente ao menos (o último http(s):// da string vence: links "grudados")
export function hostsCitados(...listas: unknown[][]): string[] {
  const cont = new Map<string, number>();
  for (const lista of listas) {
    for (const it of lista as Cfg[]) {
      for (const campo of [it?.Link, it?.Pagina]) {
        if (typeof campo !== "string") continue;
        const todos = [...campo.matchAll(/https?:\/\/[^\s/"']+/gi)];
        const ultimo = todos[todos.length - 1]?.[0];
        if (!ultimo) continue;
        try {
          const u = new URL(ultimo);
          cont.set(`${u.protocol}//${u.host.replace(/^www\./, "")}`, (cont.get(`${u.protocol}//${u.host.replace(/^www\./, "")}`) ?? 0) + 1);
        } catch {
          /* ignora */
        }
      }
    }
  }
  return [...cont.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h);
}

/* ---------- imagens ---------- */

const MIME_EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/svg+xml": "svg", "image/webp": "webp", "image/gif": "gif" };

async function imagem(url: string, tipo: string): Promise<ArquivoEnviado | undefined> {
  if (!url) return undefined;
  const r = await fetchBytes(url, LIMITE_IMAGEM);
  if (!r) return undefined;
  let ext = MIME_EXT[r.mime];
  if (!ext) {
    const doNome = new URL(url).pathname.split(".").pop()?.toLowerCase() ?? "";
    ext = ["png", "jpg", "jpeg", "svg", "webp", "gif"].includes(doNome) ? doNome : "";
    // .ico e afins não servem como logo no modelo; quem chama cai no logo provisório
    if (!ext || (r.mime && !r.mime.startsWith("image/") && r.mime !== "application/octet-stream")) return undefined;
  }
  return { buffer: r.buffer, nome: `${tipo}.${ext}` };
}

/* ---------- orquestração ---------- */

export interface ResultadoLink {
  pasta: string;
  novo: boolean;
  avisos: string[];
  resumo: { nome: string; itens: number; grupos: number; menu: number; api: string; logo: boolean; cores: boolean };
}

export function normalizarLinkPortal(entrada: string): string {
  let u = entrada.trim();
  if (u === "") throw new HttpError(400, "Informe o link do portal.");
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  if (!hostPermitido(u)) throw new HttpError(400, "Esse endereço não pode ser acessado pelo servidor.");
  return u;
}

/** Cores (inclusive das folhas de estilo ligadas) e imagens de uma página já lida. */
export async function lerIdentidade(x: PaginaExtraida) {
  let { corPrimaria, corDestaque } = x;
  if (!corPrimaria || !corDestaque) {
    for (const f of x.folhas.slice(0, 3)) {
      const css = await fetchTexto(f, 10000);
      if (!css) continue;
      corPrimaria ??= corDoCss(css, "primary");
      corDestaque ??= corDoCss(css, "accent");
      if (corPrimaria && corDestaque) break;
    }
  }
  // azul padrão do Bootstrap (--primary de quase todo site feito com ele) não é cor de marca
  if (corPrimaria && /^#(007bff|0d6efd)$/.test(corPrimaria)) corPrimaria = null;
  if (corDestaque && /^#(007bff|0d6efd|6c757d)$/.test(corDestaque)) corDestaque = null;
  return { corPrimaria, corDestaque, logo: await imagem(x.logoUrl, "logo"), icone: await imagem(x.iconeUrl, "logo-icon") };
}

/** Estado já gravado de um portal, usado na renovação para não perder o que a origem não devolveu. */
export interface Anterior {
  logo?: ArquivoEnviado;
  icone?: ArquivoEnviado;
  cacheTransparencia?: string | null;
  cacheMenu?: string | null;
  cacheOrdem?: string | null;
}

export async function importarPorLink(entrada: string, pastaOpc?: string, base?: Cfg, anterior?: Anterior): Promise<ResultadoLink> {
  const link = normalizarLinkPortal(entrada);
  const pagina = await fetchPagina(link);
  if (!pagina) throw new HttpError(400, "Não consegui abrir esse link. Confira o endereço e se o portal está no ar.");
  const avisos: string[] = [];
  const x = extrairDaPagina(pagina.html, pagina.url);
  if (x.nome === "") throw new HttpError(400, "Abri a página, mas não achei o nome do órgão nela. Cadastre este portal manualmente.");

  const { corPrimaria, corDestaque, logo: logoLido, icone: iconeLido } = await lerIdentidade(x);

  // dados: do próprio portal (proxy / cache), senão do snapshot embutido na página
  const dir = pagina.url.replace(/[?#].*$/, "").replace(/[^/]*$/, "");
  const rel = (p: string) => new URL(p, dir).toString();
  let cacheTransparencia = await primeiroValido([rel("proxy.php?d=transparencia"), rel("dados/cache_transparencia.json"), rel("cache_transparencia.json")], ehTransparencia);
  let cacheMenu = await primeiroValido([rel("proxy.php?d=menu"), rel("dados/cache_menu.json"), rel("cache_menu.json")], ehMenu);
  let cacheOrdem = await primeiroValido([rel("proxy.php?d=ordem"), rel("dados/cache_ordem.json")], ehOrdem);
  const emb = (nome: string, valida: (d: unknown) => boolean) => {
    const t = listaEmbutida(pagina.html, nome);
    try {
      return t && valida(JSON.parse(t)) ? t : null;
    } catch {
      return null;
    }
  };
  cacheTransparencia ??= emb("TRANSPARENCIA_SNAPSHOT", ehTransparencia);
  cacheMenu ??= emb("MENU_SNAPSHOT", ehMenu);

  const transp = cacheTransparencia ? (JSON.parse(cacheTransparencia) as unknown[]) : [];
  const menu = cacheMenu ? (JSON.parse(cacheMenu) as unknown[]) : [];

  // API oficial: o host mais citado nos links que responda como a API de transparência
  const config: Cfg = structuredClone(base ?? configModelo());
  config.api ??= {};
  let api = "";
  for (const origem of hostsCitados(transp, menu).slice(0, 3)) {
    const t = await testarTransparencia(origem);
    if (!t.ok || !t.total) continue;
    api = origem;
    config.api.base = origem;
    config.api.urlTransparencia = t.url;
    config.api.dominioLinks = t.dominioLinks;
    if (t.paginaOficial) {
      config.api.paginaOficial = t.paginaOficial;
      cacheOrdem ??= JSON.stringify(t.ordem);
    }
    const menuUrl = normalizarApiUrl(origem, "menu");
    if ((await baixarJson(menuUrl)).data) config.api.urlMenu = menuUrl;
    if (!cacheTransparencia) {
      const vivo = await baixarJson(t.url);
      if (vivo.raw) cacheTransparencia = vivo.raw;
    }
    break;
  }
  if (api === "" && !config.api.base) {
    avisos.push("Não encontrei a API oficial de dados abertos: o portal usará apenas os dados copiados agora (não atualizam sozinhos).");
  } else if (api === "") {
    avisos.push("Não consegui consultar a API oficial agora: mantive a configuração anterior.");
  }
  if (!cacheTransparencia) avisos.push("Não consegui copiar a lista de itens da transparência desse portal.");

  // renovação: o que a página não devolveu agora continua como estava
  const logo = logoLido ?? anterior?.logo;
  const icone = iconeLido ?? anterior?.icone;
  if (anterior) {
    cacheTransparencia ??= anterior.cacheTransparencia ?? null;
    cacheMenu ??= anterior.cacheMenu ?? null;
    cacheOrdem ??= anterior.cacheOrdem ?? null;
  }

  config.cliente = {
    ...config.cliente,
    nome: x.nome,
    nomeCompleto: x.nomeCompleto || x.nome,
    site: x.site || config.cliente?.site || "",
    cnpj: x.cnpj, endereco: x.endereco, telefone: x.telefone, email: x.email,
    redes: x.redes.length ? x.redes : config.cliente?.redes ?? [],
  };
  config.cores = { primaria: corPrimaria ?? config.cores?.primaria, destaque: corDestaque ?? config.cores?.destaque };
  if (!corPrimaria) avisos.push("Não consegui ler as cores da página: foram usadas as cores padrão.");
  config.seo = { url: x.seoUrl || pagina.url, descricao: x.descricao };
  if (x.titulo) config.textos = { ...config.textos, titulo: x.titulo };
  if (cacheOrdem) config.grupos = { ...config.grupos, ordemAutomatica: true };
  config.recursos = { ...config.recursos, linksNovaAba: true }; // como na página de referência (PREVISPA)
  config.externo = { url: pagina.url, importadoEm: new Date().toISOString() };

  // não deixa um link sobrescrever sem querer um portal feito no gerador (só reimporta o que já veio de link)
  const pasta = slug(pastaOpc?.trim() ? pastaOpc : x.nome);
  const existente = await prisma.transparenciaPortal.findUnique({ where: { pasta }, select: { config: true } });
  if (existente && !(existente.config as Cfg | null)?.externo) {
    throw new HttpError(400, `Já existe um portal "${pasta}" criado no gerador. Informe outro nome de pasta para cadastrar este link.`);
  }

  const r = await importarPortal({ pasta, config, logo, icone, cacheTransparencia: cacheTransparencia ?? undefined, cacheMenu: cacheMenu ?? undefined, cacheOrdem: cacheOrdem ?? undefined });
  const grupos = new Set((transp as Cfg[]).map((i) => i?.Grupo)).size;
  return {
    pasta: r.pasta, novo: r.novo, avisos: [...avisos, ...r.avisos],
    resumo: { nome: x.nome, itens: transp.length, grupos, menu: menu.length, api, logo: !!logo, cores: !!corPrimaria },
  };
}
