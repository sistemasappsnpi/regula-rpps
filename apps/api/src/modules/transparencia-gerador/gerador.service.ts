// Lógica do gerador de portais da transparência (porte de gerador/lib.php do projeto original).
// O portal gerado continua sendo o mesmo pacote PHP (modelo/ + config.json + logo + dados/), para
// publicar em hospedagem PHP; aqui só muda onde ele é guardado (banco) e por quem é operado (Admin).

import fs from "node:fs";
import path from "node:path";
import { zipSync } from "fflate";
import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { fetchTexto } from "./http";
import { buscarOrdem, ordemUrl, type OrdemGrupo } from "./ordem";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cfg = Record<string, any>;

/* ---------- arquivos-modelo (versionados em apps/api/assets) ---------- */

function pastaAssets(): string {
  const candidatos = [
    path.resolve(process.cwd(), "assets/transparencia-gerador"), // dev e produção (cwd = apps/api)
    path.resolve(__dirname, "../../../assets/transparencia-gerador"), // src/modules/x -> apps/api
    path.resolve(__dirname, "../../../../assets/transparencia-gerador"), // dist/src/modules/x -> apps/api
  ];
  const achado = candidatos.find((c) => fs.existsSync(path.join(c, "modelo", "config.json")));
  if (!achado) throw new HttpError(500, "Arquivos-modelo do gerador não encontrados no servidor.");
  return achado;
}

function lerJsonArquivo(file: string): Cfg | null {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
  } catch {
    return null;
  }
}

function listarArquivos(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const nome of fs.readdirSync(dir)) {
    const full = path.join(dir, nome);
    if (fs.statSync(full).isDirectory()) out.push(...listarArquivos(full, base));
    else out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out;
}

/* ---------- texto ---------- */

const ACENTOS: Record<string, string> = {
  á: "a", à: "a", ã: "a", â: "a", é: "e", ê: "e", í: "i", ó: "o", õ: "o", ô: "o", ú: "u", ü: "u", ç: "c",
  Á: "a", À: "a", Ã: "a", Â: "a", É: "e", Ê: "e", Í: "i", Ó: "o", Õ: "o", Ô: "o", Ú: "u", Ü: "u", Ç: "c",
};
function semAcento(s: unknown): string {
  return String(s ?? "").replace(/[áàãâéêíóõôúüçÁÀÃÂÉÊÍÓÕÔÚÜÇ]/g, (c) => ACENTOS[c]);
}
export function slug(s: unknown): string {
  return semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
const hexOk = (c: unknown) => /^#[0-9a-fA-F]{6}$/.test(String(c ?? ""));
const chave = (s: unknown) => semAcento(String(s ?? "").trim()).toLowerCase().replace(/\s+/g, " ");
const vazio = (v: unknown) => v === undefined || v === null || v === "" || v === false || v === 0 || v === "0";
const str = (v: unknown, def = "") => (typeof v === "string" ? v : v == null ? def : String(v));

/* ---------- API do cliente ---------- */

// Aceita o domínio ("transparencia.x.gov.br"), o endpoint sem parâmetros ou a URL completa colada do navegador.
export function normalizarApiUrl(entrada: unknown, d: string): string {
  let url = str(entrada).trim();
  if (url === "") return "";
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  let p: URL;
  try {
    p = new URL(url);
  } catch {
    return "";
  }
  if (!p.hostname) return "";
  let pathname = p.pathname.replace(/\/+$/, "");
  if (pathname === "" || /\/(acessoainformacao|index\.\w+)$/i.test(pathname)) pathname = "/dadosabertosexportar";
  // completa o que faltar; sem itens_por_pagina a API devolve só a primeira página (10 itens)
  const q = new URLSearchParams(p.search);
  if (!q.has("d")) q.set("d", d);
  if (!q.has("a")) q.set("a", "");
  if (!q.has("f")) q.set("f", "json");
  q.set("itens_por_pagina", "1000000");
  return `${p.protocol}//${p.host}${pathname}?${q.toString()}`;
}

interface Baixado {
  data: unknown[] | null;
  raw: string | null;
  erro: string;
}

export async function baixarJson(url: string): Promise<Baixado> {
  const texto = await fetchTexto(url, 20000);
  if (texto === null) return { data: null, raw: null, erro: "Sem resposta (endereço errado, fora do ar ou HTTPS bloqueado)." };
  const raw = texto.replace(/^﻿/, "");
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { data: null, raw: null, erro: "A resposta não é JSON." };
  }
  if (data === null || typeof data !== "object") return { data: null, raw: null, erro: "A resposta não é JSON." };
  if (!Array.isArray(data)) {
    // alguns portais embrulham a lista: {"dados":[...]} / {"data":[...]}
    const interno = Object.values(data as Cfg).find((v) => Array.isArray(v) && v.length > 0);
    if (interno) return { data: interno as unknown[], raw: JSON.stringify(interno), erro: "" };
    return { data: [], raw, erro: "" };
  }
  return { data, raw, erro: "" };
}

// Mantém da ordem lida na página só os grupos que existem na API (descarta títulos de outras seções da página).
function casarOrdem(ordem: OrdemGrupo[], gruposApi: string[]): OrdemGrupo[] {
  if (ordem.length === 0) return [];
  const validos = new Map<string, string>();
  for (const g of gruposApi) validos.set(chave(g), g);
  const out = new Map<string, OrdemGrupo>();
  for (const o of ordem) {
    const k = chave(o.nome);
    if (!validos.has(k) || out.has(k)) continue;
    out.set(k, { nome: validos.get(k)!, itens: o.itens });
  }
  // só vale se a página realmente descreve o catálogo (a maioria dos grupos apareceu lá)
  return out.size >= Math.max(2, Math.ceil(gruposApi.length * 0.6)) ? [...out.values()] : [];
}

function hostDe(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}
function origemDe(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "";
  }
}

// Os links da API costumam usar o domínio com "www"; os relativos precisam desse domínio para funcionar.
function detectarDominioLinks(data: Cfg[], apiUrl: string): string {
  const apiHost = new URL(apiUrl).hostname;
  for (const it of data) {
    if (!it?.Link || !/^https?:\/\//.test(it.Link)) continue;
    try {
      const u = new URL(it.Link);
      if (u.hostname.replace(/^www\./, "") === apiHost.replace(/^www\./, "")) return `${u.protocol}//${u.host}`;
    } catch {
      /* link inválido: ignora */
    }
  }
  return origemDe(apiUrl);
}

export async function testarTransparencia(entrada: string) {
  const url = normalizarApiUrl(entrada, "transparencia");
  if (url === "") return { ok: false, erro: "Informe a URL." };
  const { data, erro } = await baixarJson(url);
  if (data === null) return { ok: false, url, erro };
  const lista = data as Cfg[];
  if (lista.length > 0 && !(lista[0]?.Grupo !== undefined && lista[0]?.Descricao !== undefined)) {
    return { ok: false, url, erro: "JSON sem os campos esperados (Grupo, Descricao, Link). Esta é mesmo a API de transparência?" };
  }
  const grupos = new Map<string, number>();
  for (const it of lista) {
    const g = str(it?.Grupo);
    if (g === "") continue;
    grupos.set(g, (grupos.get(g) ?? 0) + 1);
  }
  // ordem oficial: a API não tem campo de ordem, então ela é lida da página do cliente
  const pagina = ordemUrl(origemDe(url));
  const ordem = casarOrdem(await buscarOrdem(pagina), [...grupos.keys()]);

  let listaGrupos = [...grupos.entries()].map(([nome, itens]) => ({ nome, itens }));
  if (ordem.length > 0) {
    // devolve as categorias já na ordem em que o portal oficial exibe
    const pos = new Map(ordem.map((o, i) => [chave(o.nome), i]));
    listaGrupos = listaGrupos
      .map((g, i) => ({ g, i }))
      .sort((a, b) => (pos.get(chave(a.g.nome)) ?? 1e9) - (pos.get(chave(b.g.nome)) ?? 1e9) || a.i - b.i)
      .map((x) => x.g);
  }
  return {
    ok: true, url, total: lista.length, grupos: listaGrupos,
    dominioLinks: detectarDominioLinks(lista, url), paginaOficial: ordem.length > 0 ? pagina : "", ordem,
  };
}

export async function testarMenu(entrada: string) {
  const url = normalizarApiUrl(entrada, "menu");
  if (url === "") return { ok: false, erro: "Informe a URL." };
  const { data, erro } = await baixarJson(url);
  if (data === null) return { ok: false, url, erro };
  const lista = data as Cfg[];
  if (lista.length > 0 && lista[0]?.Nome === undefined) {
    return { ok: false, url, erro: "JSON sem os campos esperados (Id, NMenu, Nome, Pagina). Esta é mesmo a API do menu?" };
  }
  const raizes = lista
    .filter((m) => vazio(m?.NMenu))
    .map((m) => ({ nome: str(m.Nome), ordem: Number(m.Ordem ?? 0) || 0 }))
    .sort((a, b) => a.ordem - b.ordem);
  return { ok: true, url, total: lista.length, itens: raizes.map((r) => r.nome) };
}

/* ---------- sugestões de botões (Atricon / Pró-Gestão) ---------- */

const STOP = new Set([
  "de", "da", "do", "das", "dos", "e", "a", "o", "as", "os", "em", "no", "na", "nos", "nas", "para", "com", "por",
  "ao", "aos", "sobre", "the", "um", "uma", "ou", "sua", "seu", "suas", "seus", "pelo", "pela", "que", "se", "div", "ainda",
]);

function palavras(s: string): string[] {
  const out = new Set<string>();
  for (const p of chave(s).split(/[^a-z0-9]+/)) {
    if (p === "" || STOP.has(p) || p.length < 3) continue;
    out.add(p.replace(/s+$/, ""));
  }
  return [...out];
}

// Duas palavras contam como a mesma se uma é abreviação da outra ("estrut." / "estrutura")
// ou se compartilham um começo longo ("demonstrações" / "demonstrativos") — mas não "publicidade" / "publicações".
function mesmaPalavra(x: string, y: string): boolean {
  if (x === y) return true;
  const n = Math.min(x.length, y.length);
  let i = 0;
  while (i < n && x[i] === y[i]) i++;
  if (i === n && n >= 6) return true; // uma é começo da outra
  return i >= 7; // mesmo radical longo
}

// Quanto o texto de uma sugestão se parece com um item já publicado pelo cliente (0 a 1).
// Divide pela média geométrica dos tamanhos: um rótulo longo não "casa" com um item curto
// só porque duas palavras coincidem.
function semelhanca(a: string, b: string): number {
  const pa = palavras(a);
  const pb = palavras(b);
  if (pa.length === 0 || pb.length === 0) return 0;
  let comuns = 0;
  const usados = new Set<number>();
  for (const x of pa) {
    for (let j = 0; j < pb.length; j++) {
      if (usados.has(j) || !mesmaPalavra(x, pb[j])) continue;
      usados.add(j);
      comuns++;
      break;
    }
  }
  // rótulo com 3 palavras ou mais precisa de 2 coincidências: uma só costuma ser palavra genérica
  if (comuns < 2 && pa.length >= 3) return 0;
  return comuns / Math.sqrt(pa.length * pb.length);
}

// Melhor semelhança entre a sugestão e um item publicado, testando também os apelidos da sugestão.
function melhorSemelhanca(sugestao: Cfg, texto: string): number {
  let melhor = semelhanca(sugestao.rotulo, texto);
  for (const apelido of sugestao.apelidos ?? []) melhor = Math.max(melhor, semelhanca(apelido, texto));
  return melhor;
}

function carregarCatalogo(nome: string): Cfg | null {
  return lerJsonArquivo(path.join(pastaAssets(), "presets", "sugestoes", `${nome}.json`));
}

/** Compara os catálogos de sugestões com o que a API do cliente já publica (campos Grupo / Descricao / MaisInformacoes). */
export function sugestoesPara(itens: Cfg[], extras: Cfg[] = []) {
  const base: { texto: string; nome: string; grupo: string }[] = [];
  for (const it of [...itens, ...extras]) {
    if (!it?.Descricao) continue;
    base.push({ texto: `${it.Descricao} ${it.MaisInformacoes ?? ""}`, nome: String(it.Descricao), grupo: str(it.Grupo) });
  }
  const saida = [];
  for (const nome of ["atricon", "progestao"]) {
    const cat = carregarCatalogo(nome);
    if (!cat) continue;
    let atendidos = 0;
    const lista = (cat.itens as Cfg[]).map((s) => {
      let melhor: (typeof base)[number] | null = null;
      let score = 0;
      for (const b of base) {
        const v = melhorSemelhanca(s, b.nome);
        if (v > score) {
          score = v;
          melhor = b;
        }
      }
      const ok = score >= 0.55;
      if (ok) atendidos++;
      return {
        grupo: s.grupo, rotulo: s.rotulo, descricao: s.descricao, icone: s.icone, criterio: s.criterio, exigencia: s.exigencia,
        // por que a sugestão existe: base legal e o quanto ela pesa (vai para o tooltip no painel)
        fundamentacao: s.fundamentacao ?? "", classificacao: s.classificacao ?? "",
        atendido: ok, parecido: melhor && score >= 0.38 ? melhor.nome : "", grupoAtual: ok && melhor ? melhor.grupo : "",
      };
    });
    saida.push({
      id: nome, sigla: cat.sigla, fonte: cat.fonte, total: lista.length, atendidos, itens: lista,
      recursos: Array.isArray(cat.recursos) ? cat.recursos.length : 0,
    });
  }
  return saida;
}

export async function calcularSugestoes(urlEntrada: string, pasta: string) {
  const url = normalizarApiUrl(urlEntrada, "transparencia");
  let itens: Cfg[] = [];
  if (url) itens = ((await baixarJson(url)).data as Cfg[] | null) ?? [];
  let extras: Cfg[] = [];
  if (pasta) {
    const portal = await prisma.transparenciaPortal.findUnique({ where: { pasta: slug(pasta) } });
    if (portal) {
      if (itens.length === 0 && portal.cacheTransparencia) {
        try {
          itens = JSON.parse(portal.cacheTransparencia);
        } catch {
          /* cache ilegível: segue sem ele */
        }
      }
      extras = ((portal.config as Cfg)?.itensExtras as Cfg[]) ?? [];
    }
  }
  return { ok: true, itensApi: itens.length, catalogos: sugestoesPara(itens, extras) };
}

/* ---------- geração ---------- */

const escHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");

function logoProvisorio(nome: string, cor: string, destaque: string): string {
  const w = Math.max(160, [...nome].length * 19 + 40);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="78" viewBox="0 0 ${w} 78"><rect x="0" y="9" width="8" height="60" rx="3" fill="${destaque}"/><text x="22" y="50" font-family="Segoe UI,Arial,sans-serif" font-size="32" font-weight="700" fill="${cor}">${escHtml(nome)}</text></svg>\n`;
}

const EXTENSOES: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", svg: "image/svg+xml", webp: "image/webp", gif: "image/gif",
};
export const LIMITE_IMAGEM = 3 * 1024 * 1024;

export interface ArquivoEnviado {
  buffer: Buffer;
  nome: string;
}

const PRESET_ARQUIVOS = ["transparencia.local.json", "menu.local.json"];

export async function listarClientes() {
  const rows = await prisma.transparenciaPortal.findMany({
    select: { pasta: true, nome: true, updatedAt: true },
    orderBy: { nome: "asc" },
  });
  return rows.map((r) => ({ pasta: r.pasta, nome: r.nome, atualizadoEm: r.updatedAt }));
}

function dataUrl(mime: string | null, dados: Uint8Array | null): string | null {
  return dados && mime ? `data:${mime};base64,${Buffer.from(dados).toString("base64")}` : null;
}

export async function carregarCliente(pasta: string) {
  const p = await prisma.transparenciaPortal.findUnique({ where: { pasta: slug(pasta) } });
  if (!p) return null;
  return {
    config: p.config as Cfg,
    logoDataUrl: dataUrl(p.logoMime, p.logoDados),
    iconeDataUrl: dataUrl(p.iconeMime, p.iconeDados),
  };
}

export async function excluirCliente(pasta: string): Promise<boolean> {
  const r = await prisma.transparenciaPortal.deleteMany({ where: { pasta: slug(pasta) } });
  return r.count > 0;
}

/**
 * Cria ou atualiza um portal. `entrada` tem o formato do config.json (cliente, cores, api, seo, textos,
 * grupos, acessibilidade, recursos, itensExtras) + `pasta` e `preset`.
 */
export async function gerarCliente(entrada: Cfg, arquivos: { logo?: ArquivoEnviado; icone?: ArquivoEnviado }) {
  const avisos: string[] = [];
  const nome = str(entrada.cliente?.nome).trim();
  if (nome === "") throw new HttpError(400, "Informe o nome do cliente.");
  const pasta = slug(!vazio(entrada.pasta) ? entrada.pasta : nome);
  if (pasta === "") throw new HttpError(400, "Nome de pasta inválido.");

  const existente = await prisma.transparenciaPortal.findUnique({ where: { pasta } });
  const config: Cfg = existente ? structuredClone(existente.config as Cfg) : (lerJsonArquivo(path.join(pastaAssets(), "modelo", "config.json")) ?? {});
  const antigo: Cfg = structuredClone(config);
  const dados = {
    logo: existente ? { nome: existente.logoNome, mime: existente.logoMime, dados: existente.logoDados as Uint8Array | null } : { nome: null as string | null, mime: null as string | null, dados: null as Uint8Array | null },
    icone: existente ? { nome: existente.iconeNome, mime: existente.iconeMime, dados: existente.iconeDados as Uint8Array | null } : { nome: null as string | null, mime: null as string | null, dados: null as Uint8Array | null },
    cacheTransparencia: existente?.cacheTransparencia ?? null,
    cacheMenu: existente?.cacheMenu ?? null,
    cacheOrdem: existente?.cacheOrdem ?? null,
    preset: existente?.preset ?? null,
  };

  // seções vindas do formulário substituem as do config; o resto (glossário, perfis...) é mantido
  for (const sec of ["cliente", "seo", "textos", "acessibilidade", "recursos"]) {
    if (entrada[sec] && typeof entrada[sec] === "object" && !Array.isArray(entrada[sec])) config[sec] = { ...(config[sec] ?? {}), ...entrada[sec] };
  }
  if (Array.isArray(entrada.itensExtras)) {
    const extras: Cfg[] = [];
    for (const e of entrada.itensExtras as Cfg[]) {
      const desc = str(e?.Descricao).trim();
      const grupo = str(e?.Grupo).trim();
      let link = str(e?.Link).trim();
      if (desc === "" || grupo === "" || link === "") continue;
      if (!/^(https?:\/\/|mailto:|\/)/i.test(link)) link = "https://" + link.replace(/^\/+/, "");
      extras.push({
        Grupo: grupo, Descricao: desc, Link: link, MaisInformacoes: str(e.MaisInformacoes).trim(),
        NomeImagem: str(e.NomeImagem), Amparo: str(e.Amparo), Cor: e.Cor ?? null, Fonte: str(e.Fonte), Ref: str(e.Ref),
      });
    }
    config.itensExtras = extras;
  }
  if (entrada.grupos && typeof entrada.grupos === "object" && !Array.isArray(entrada.grupos)) {
    config.grupos = { ...(config.grupos ?? {}), ...entrada.grupos };
  }

  // cores: se a principal mudou, descarta tons fixados à mão para que sejam recalculados
  const primaria = str(entrada.cores?.primaria, "#107078").toLowerCase();
  const destaque = str(entrada.cores?.destaque, "#98c810").toLowerCase();
  if (!hexOk(primaria) || !hexOk(destaque)) throw new HttpError(400, "Cores inválidas (use #RRGGBB).");
  const cores: Cfg = { ...(config.cores ?? {}) };
  if (!antigo.cores?.primaria || String(antigo.cores.primaria).toLowerCase() !== primaria) {
    for (const k of ["primariaEscura", "primariaSuave", "lateral", "lateralItem", "rodape"]) delete cores[k];
  }
  if (!antigo.cores?.destaque || String(antigo.cores.destaque).toLowerCase() !== destaque) delete cores.destaqueForte;
  cores.primaria = primaria;
  cores.destaque = destaque;
  if (!vazio(entrada.cores?.rodape) && hexOk(entrada.cores.rodape)) cores.rodape = String(entrada.cores.rodape).toLowerCase();
  config.cores = cores;

  // API
  const api: Cfg = { ...(config.api ?? {}) };
  let urlT = normalizarApiUrl(entrada.api?.urlTransparencia, "transparencia");
  let urlM = normalizarApiUrl(entrada.api?.urlMenu, "menu");
  // chamada sem URL nenhuma (ex.: só mexendo em cores) não apaga a API já configurada
  if (urlT === "" && urlM === "" && !vazio(api.base)) {
    urlT = apiUrlDe(api, "transparencia");
    urlM = apiUrlDe(api, "menu");
  }
  api.urlTransparencia = urlT;
  api.urlMenu = urlM;
  api.base = urlT ? origemDe(urlT) : "";
  api.transparencia = urlT !== "";
  api.menu = urlM !== "";
  if (!vazio(entrada.api?.atualizarMinutos)) api.atualizarMinutos = Math.max(1, Math.trunc(Number(entrada.api.atualizarMinutos)) || 1);
  config.api = api;

  // logo e ícone
  config.cliente = config.cliente ?? {};
  for (const tipo of ["logo", "icone"] as const) {
    const arq = arquivos[tipo];
    if (!arq) continue;
    const ext = (arq.nome.split(".").pop() ?? "").toLowerCase();
    if (!EXTENSOES[ext]) throw new HttpError(400, `Formato de ${tipo} não aceito: .${ext}`);
    if (arq.buffer.length > LIMITE_IMAGEM) throw new HttpError(400, `O ${tipo} passa de 3 MB.`);
    const nomeArq = `${tipo === "logo" ? "logo" : "logo-icon"}.${ext}`;
    dados[tipo] = { nome: nomeArq, mime: EXTENSOES[ext], dados: arq.buffer };
    config.cliente[tipo] = nomeArq;
    if (tipo === "logo" && !arquivos.icone && !dados.icone.dados) config.cliente.icone = nomeArq;
  }
  // sem arquivo de ícone próprio, a aba usa a logo
  if (!dados.icone.dados) config.cliente.icone = config.cliente.logo;

  const logoGeradoAntes = dados.logo.nome === "logo.svg" && !arquivos.logo && dados.logo.dados && Buffer.from(dados.logo.dados).toString("utf8").includes("<text");
  if (!dados.logo.dados || logoGeradoAntes) {
    dados.logo = { nome: "logo.svg", mime: "image/svg+xml", dados: Buffer.from(logoProvisorio(nome, primaria, destaque), "utf8") };
    config.cliente.logo = "logo.svg";
    if (!dados.icone.dados) config.cliente.icone = "logo.svg";
    avisos.push("Sem logo enviado: foi gerado um logo provisório com o nome do cliente.");
  }

  // catálogo de reserva
  const preset = str(entrada.preset).replace(/[^a-z0-9-]/g, "");
  if (preset !== "") {
    const p = path.join(pastaAssets(), "presets", preset);
    if (!fs.existsSync(p) || !fs.statSync(p).isDirectory()) throw new HttpError(400, `Preset não encontrado: ${preset}`);
    dados.preset = preset;
    const g = lerJsonArquivo(path.join(p, "grupos.json"));
    if (g && (!config.grupos?.ordem || config.grupos.ordem.length === 0)) config.grupos = { ...(config.grupos ?? {}), ...g };
  }
  const temLocal = (arquivo: string) => !!dados.preset && fs.existsSync(path.join(pastaAssets(), "presets", dados.preset, arquivo));

  config.grupos = config.grupos ?? {};
  // primeira cópia dos dados (o portal abre mesmo se a API estiver lenta no primeiro acesso)
  for (const [d, url] of [["transparencia", urlT], ["menu", urlM]] as const) {
    if (url === "") {
      if (!temLocal(`${d}.local.json`)) {
        avisos.push(d === "menu" ? "Sem API do menu: a barra de menu ficará vazia." : "Sem API de transparência e sem catálogo local: a página ficará sem itens.");
      }
      continue;
    }
    const { data, raw, erro } = await baixarJson(url);
    if (data === null) {
      avisos.push(`API de ${d} não respondeu agora (${erro}). O portal tentará de novo sozinho.`);
      continue;
    }
    if (d === "menu") {
      dados.cacheMenu = raw;
      continue;
    }
    dados.cacheTransparencia = raw;

    const lista = data as Cfg[];
    config.api.dominioLinks = detectarDominioLinks(lista, url);
    const daApi: string[] = [];
    for (const it of lista) if (it?.Grupo && !daApi.includes(it.Grupo)) daApi.push(it.Grupo);

    // ordem de exibição (categorias e itens) lida da página oficial do cliente
    const pagina = ordemUrl(config.api.base);
    const ordem = casarOrdem(await buscarOrdem(pagina), daApi);
    const auto = entrada.grupos?.ordemAutomatica !== false;
    if (ordem.length > 0) {
      config.api.paginaOficial = pagina;
      dados.cacheOrdem = JSON.stringify(ordem);
      const itens: Record<string, string[]> = {};
      for (const o of ordem) if (o.itens.length > 0) itens[o.nome] = o.itens;
      config.grupos.ordemItens = itens;
      if (auto || !config.grupos.ordem || config.grupos.ordem.length === 0) {
        const nomes = ordem.map((o) => o.nome);
        for (const g of daApi) if (!nomes.includes(g)) nomes.push(g);
        config.grupos.ordem = nomes;
      }
    } else {
      config.api.paginaOficial = "";
      if (auto) avisos.push(`Não encontrei a ordem oficial em ${pagina}: as categorias seguem a ordem em que a API as devolve.`);
      if (!config.grupos.ordem || config.grupos.ordem.length === 0) config.grupos.ordem = daApi;
    }
    config.grupos.ordemAutomatica = auto;
  }

  const gravar = {
    nome, config, preset: dados.preset,
    logoNome: dados.logo.nome, logoMime: dados.logo.mime, logoDados: dados.logo.dados ? Buffer.from(dados.logo.dados) : null,
    iconeNome: dados.icone.nome, iconeMime: dados.icone.mime, iconeDados: dados.icone.dados ? Buffer.from(dados.icone.dados) : null,
    cacheTransparencia: dados.cacheTransparencia, cacheMenu: dados.cacheMenu, cacheOrdem: dados.cacheOrdem,
  };
  await prisma.transparenciaPortal.upsert({ where: { pasta }, create: { pasta, ...gravar }, update: gravar });
  return { pasta, novo: !existente, avisos };
}

export interface ImportacaoPortal {
  pasta?: string;
  config: Cfg;
  logo?: ArquivoEnviado;
  icone?: ArquivoEnviado;
  cacheTransparencia?: string;
  cacheMenu?: string;
  cacheOrdem?: string;
}

/**
 * Traz para o Regula um portal que já existia na pasta clientes/<nome> do gerador antigo:
 * o config.json vale como está; logo, ícone e dados/cache_* são opcionais. Sobrescreve um portal
 * de mesma pasta.
 */
export async function importarPortal(imp: ImportacaoPortal) {
  const config = imp.config;
  if (!config || typeof config !== "object" || Array.isArray(config) || typeof config.cliente !== "object") {
    throw new HttpError(400, "config.json inválido: faltou a seção \"cliente\".");
  }
  const nome = str(config.cliente.nome).trim();
  if (nome === "") throw new HttpError(400, "config.json sem cliente.nome.");
  const pasta = slug(!vazio(imp.pasta) ? imp.pasta : nome);
  if (pasta === "") throw new HttpError(400, "Nome de pasta inválido.");

  const imagem = (tipo: "logo" | "icone", arq: ArquivoEnviado | undefined) => {
    if (!arq) return null;
    const ext = (arq.nome.split(".").pop() ?? "").toLowerCase();
    if (!EXTENSOES[ext]) throw new HttpError(400, `Formato de ${tipo} não aceito: .${ext}`);
    if (arq.buffer.length > LIMITE_IMAGEM) throw new HttpError(400, `O ${tipo} passa de 3 MB.`);
    return { nome: `${tipo === "logo" ? "logo" : "logo-icon"}.${ext}`, mime: EXTENSOES[ext], dados: arq.buffer };
  };
  const avisos: string[] = [];
  let logo = imagem("logo", imp.logo);
  const icone = imagem("icone", imp.icone);
  if (logo) config.cliente.logo = logo.nome;
  else {
    logo = { nome: "logo.svg", mime: "image/svg+xml", dados: Buffer.from(logoProvisorio(nome, str(config.cores?.primaria, "#107078"), str(config.cores?.destaque, "#98c810")), "utf8") };
    config.cliente.logo = logo.nome;
    avisos.push("Sem logo no envio: foi gerado um logo provisório com o nome do cliente.");
  }
  config.cliente.icone = icone ? icone.nome : config.cliente.logo;
  for (const [campo, texto] of [["cacheTransparencia", imp.cacheTransparencia], ["cacheMenu", imp.cacheMenu], ["cacheOrdem", imp.cacheOrdem]] as const) {
    if (texto) {
      try {
        JSON.parse(texto.replace(/^﻿/, ""));
      } catch {
        throw new HttpError(400, `${campo} não é um JSON válido.`);
      }
    }
  }
  const strip = (t?: string) => (t ? t.replace(/^﻿/, "") : null);
  const existente = await prisma.transparenciaPortal.findUnique({ where: { pasta } });
  const gravar = {
    nome, config, preset: existente?.preset ?? null,
    logoNome: logo.nome, logoMime: logo.mime, logoDados: Buffer.from(logo.dados),
    iconeNome: icone?.nome ?? null, iconeMime: icone?.mime ?? null, iconeDados: icone ? Buffer.from(icone.dados) : null,
    cacheTransparencia: strip(imp.cacheTransparencia), cacheMenu: strip(imp.cacheMenu), cacheOrdem: strip(imp.cacheOrdem),
  };
  await prisma.transparenciaPortal.upsert({ where: { pasta }, create: { pasta, ...gravar }, update: gravar });
  return { pasta, novo: !existente, avisos };
}

// URL já configurada para um conjunto, seja completa (urlX) ou montada a partir de api.base.
function apiUrlDe(api: Cfg, d: string): string {
  const k = "url" + d[0].toUpperCase() + d.slice(1);
  if (!vazio(api[k])) return api[k];
  if (vazio(api.base) || api[d] === false) return "";
  return normalizarApiUrl(api.base, d);
}

/* ---------- pacote para publicar ---------- */

export async function montarZip(pasta: string): Promise<Buffer | null> {
  const p = await prisma.transparenciaPortal.findUnique({ where: { pasta: slug(pasta) } });
  if (!p) return null;
  const modelo = path.join(pastaAssets(), "modelo");
  const arquivos: Record<string, Uint8Array> = {};

  for (const rel of listarArquivos(modelo)) {
    if (rel === "config.json" || rel.startsWith("dados/cache_") || rel === "dados/feedback_data.json") continue;
    arquivos[rel] = fs.readFileSync(path.join(modelo, rel));
  }
  arquivos["config.json"] = Buffer.from(JSON.stringify(p.config, null, 4) + "\n", "utf8");
  if (p.logoNome && p.logoDados) arquivos[p.logoNome] = p.logoDados;
  if (p.iconeNome && p.iconeDados) arquivos[p.iconeNome] = p.iconeDados;
  if (p.cacheTransparencia) arquivos["dados/cache_transparencia.json"] = Buffer.from(p.cacheTransparencia, "utf8");
  if (p.cacheMenu) arquivos["dados/cache_menu.json"] = Buffer.from(p.cacheMenu, "utf8");
  if (p.cacheOrdem) arquivos["dados/cache_ordem.json"] = Buffer.from(p.cacheOrdem, "utf8");
  if (p.preset) {
    const dir = path.join(pastaAssets(), "presets", p.preset);
    for (const f of PRESET_ARQUIVOS) if (fs.existsSync(path.join(dir, f))) arquivos[`dados/${f}`] = fs.readFileSync(path.join(dir, f));
  }
  return Buffer.from(zipSync(arquivos, { level: 6 }));
}

/* ---------- ícones (sprite do modelo) ---------- */

// ícones usados pelo próprio layout do portal, que não servem como ícone de categoria
const ICONES_DE_INTERFACE = new Set([
  "i-x", "i-arrow", "i-chevron-up", "i-chevron-down", "i-menu", "i-search", "i-thumb-up", "i-thumb-down", "i-speaker", "i-pin",
  "i-phone", "i-mail", "i-card", "i-youtube", "i-instagram", "i-facebook", "i-globe", "i-home", "i-external", "i-contrast",
]);

export function iconesDoModelo() {
  const svg = fs.readFileSync(path.join(pastaAssets(), "modelo", "partes", "icones.svg"), "utf8");
  const ids = [...svg.matchAll(/<symbol[^>]*\sid="(i-[^"]+)"/g)].map((m) => m[1]).filter((id) => !ICONES_DE_INTERFACE.has(id));
  return { svg, ids };
}
