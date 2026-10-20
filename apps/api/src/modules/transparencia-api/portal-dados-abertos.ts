import { prisma } from "../../db/prisma";
import { ENDPOINT_COLEGIADOS } from "./catalogo";
import { sincronizarRegistros, type ResultadoColeta } from "./sincronizar";

// Coleta dos dados abertos do portal de transparência do órgão: <origem>/dadosabertosexportar?d=<conjunto>&a=<ano>&f=json
// Público, sem chave (a página /dadosabertos do próprio portal documenta os conjuntos e libera o uso).
//
// Limites observados na prática:
//  - uma chamada devolve no máximo ~200 registros (acima de ~250 volta vazio) e não existe parâmetro de página;
//  - o parâmetro `a` filtra pelo exercício (ano), e é assim que se alcança o que passa de 200.

export interface DatasetPortal {
  endpoint: string; // código gravado em TransparenciaApiRegistro.endpoint
  d: string; // nome do conjunto na API do portal
}

export const DATASETS_PORTAL: DatasetPortal[] = [
  { endpoint: "portal-publicacoes", d: "publicacoes" },
  { endpoint: "portal-licitacoes", d: "licitacoes" },
  { endpoint: "portal-contratos", d: "contratos" },
  { endpoint: "portal-leis", d: "leis" },
  { endpoint: "portal-portarias", d: "portarias" },
  { endpoint: "portal-lrf", d: "LRF" },
  { endpoint: "portal-noticias", d: "noticias" },
  { endpoint: "portal-conselhos", d: "conselhos" },
  { endpoint: "portal-secretarias", d: "secretarias" },
  { endpoint: "portal-concursos", d: "concursopublico" },
  { endpoint: "portal-processos-seletivos", d: "processoseletivo" },
  { endpoint: "portal-servicos-online", d: "servicosonline" },
  { endpoint: "portal-selos", d: "selos" },
];

const POR_CHAMADA = 200;
// perto do teto: pode haver mais registros do que a chamada devolveu
const LIMIAR_TETO = 190;
const ANO_INICIAL = 2000;
const VARREDURA_COMPLETA_A_CADA_MS = 24 * 60 * 60_000;

const ultimaVarredura = new Map<string, number>(); // `${tenantId}|${endpoint}` -> quando foi a última varredura por exercício

function esperar(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function buscarConjunto(base: string, d: string, ano: string, extra = ""): Promise<Record<string, unknown>[]> {
  const url = `${base}/dadosabertosexportar?d=${encodeURIComponent(d)}&a=${encodeURIComponent(ano)}&f=json&itens_por_pagina=${POR_CHAMADA}${extra}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!resp.ok) throw new Error(`o portal respondeu HTTP ${resp.status}`);
  const texto = (await resp.text()).trim();
  // conjunto sem dados (ou exercício sem registro) volta vazio ou com um aviso em HTML — não é erro
  if (!texto.startsWith("[")) return [];
  const corpo = JSON.parse(texto) as unknown;
  if (!Array.isArray(corpo)) return [];
  return corpo.filter((i): i is Record<string, unknown> => Boolean(i) && typeof i === "object" && !Array.isArray(i));
}

// Categorias (tipos) de publicação do portal: ids que o filtro "tipo" da página /publicacoes oferece. A API de dados
// abertos aceita `cat=<id>`, e é isso que permite passar do teto de 200 registros por exercício.
const categoriasEmCache = new Map<string, { em: number; ids: string[] }>();
export async function categoriasDoPortal(base: string): Promise<string[]> {
  const guardado = categoriasEmCache.get(base);
  if (guardado && Date.now() - guardado.em < 24 * 60 * 60_000) return guardado.ids;
  const resp = await fetch(`${base}/publicacoes`, { signal: AbortSignal.timeout(30_000) });
  if (!resp.ok) throw new Error(`o portal respondeu HTTP ${resp.status}`);
  const html = await resp.text();
  const select = html.match(/name=.cat.[\s\S]*?<\/select>|name=.cat.[\s\S]*?<select>/i)?.[0] ?? "";
  const ids = [...select.matchAll(/<option\s+value=.(\d+).>/gi)].map((m) => m[1]);
  categoriasEmCache.set(base, { em: Date.now(), ids });
  return ids;
}

// Todas as publicações de um exercício: uma chamada e, se bater no teto, uma por categoria (cat=<id>).
export async function buscarExercicioCompleto(base: string, d: string, ano: string): Promise<{ itens: Record<string, unknown>[]; completo: boolean }> {
  const geral = await buscarConjunto(base, d, ano);
  if (geral.length < LIMIAR_TETO || d !== "publicacoes") return { itens: geral, completo: geral.length < LIMIAR_TETO };

  const mapa = new Map<string, Record<string, unknown>>();
  for (const r of geral) mapa.set(JSON.stringify(r), r);
  let completo = true;
  for (const cat of await categoriasDoPortal(base)) {
    const doCat = await buscarConjunto(base, d, ano, `&cat=${cat}`);
    if (doCat.length >= LIMIAR_TETO) completo = false; // nem por categoria coube: não dá para garantir
    for (const r of doCat) mapa.set(JSON.stringify(r), r);
    await esperar(120);
  }
  return { itens: [...mapa.values()], completo };
}

async function coletarConjunto(tenantId: string, base: string, ds: DatasetPortal): Promise<ResultadoColeta> {
  try {
    const recentes = await buscarConjunto(base, ds.d, "");
    let itens = recentes;
    let completo = recentes.length < LIMIAR_TETO; // veio tudo numa chamada só

    if (!completo) {
      const chave = `${tenantId}|${ds.endpoint}`;
      const jaTem = await prisma.transparenciaApiRegistro.count({ where: { tenantId, endpoint: ds.endpoint } });
      const vencida = Date.now() - (ultimaVarredura.get(chave) ?? 0) > VARREDURA_COMPLETA_A_CADA_MS;
      if (jaTem === 0 || vencida) {
        // varredura por exercício: junta tudo o que o conjunto tem
        const mapa = new Map<string, Record<string, unknown>>();
        let anoEstourou = false;
        const anoFinal = new Date().getFullYear() + 1;
        for (let ano = anoFinal; ano >= ANO_INICIAL; ano--) {
          const { itens: doAno, completo: anoCompleto } = await buscarExercicioCompleto(base, ds.d, String(ano));
          if (!anoCompleto) anoEstourou = true;
          for (const r of doAno) mapa.set(JSON.stringify(r), r);
          await esperar(150);
        }
        for (const r of recentes) mapa.set(JSON.stringify(r), r);
        // registros com exercício vazio ou fora do intervalo varrido não aparecem em nenhum `a=<ano>`: pede cada categoria
        // sem ano (as 200 mais novas de cada uma), o que pega esses "soltos"
        if (ds.d === "publicacoes") {
          for (const cat of await categoriasDoPortal(base)) {
            for (const r of await buscarConjunto(base, ds.d, "", `&cat=${cat}`)) mapa.set(JSON.stringify(r), r);
            await esperar(120);
          }
        }
        itens = [...mapa.values()];
        // só vale como "completa" se nenhum exercício bateu no teto (aí não dá pra saber se faltou algo)
        completo = !anoEstourou;
        ultimaVarredura.set(chave, Date.now());
        if (anoEstourou) console.warn(`[transparencia-api] ${ds.d}: algum exercício passou de ${LIMIAR_TETO} registros; lista pode estar incompleta`);
      }
    }

    const r = await sincronizarRegistros(tenantId, ds.endpoint, itens, completo);
    return { codigo: ds.endpoint, ok: true, ...r };
  } catch (err) {
    return { codigo: ds.endpoint, ok: false, erro: err instanceof Error ? err.message : "erro desconhecido" };
  }
}

// ---------------------------------------------------------------------------------------------------------
// Fontes 2 e 3 do mesmo portal (além dos 23 conjuntos de /dadosabertos):
//  - exportação JSON de páginas do próprio portal: <origem>/<página>/export?exp=json (Decretos, Prestação de contas,
//    Perguntas frequentes, Glossário, Transparência de benefícios). É o mesmo botão "Exportar" que o visitante vê.
//  - tabela pública de documentos de cada colegiado: <origem>/conselhos/<id>?tipo=<tipo> ("Lista de ações realizadas":
//    Data, Descrição, Local, Tipo e o PDF). Não há JSON para isso, então lemos a tabela HTML.
// ---------------------------------------------------------------------------------------------------------

export interface ExportPortal {
  endpoint: string;
  caminho: string; // <origem>/<caminho>/export?exp=json
}

export const EXPORTS_PORTAL: ExportPortal[] = [
  { endpoint: "portal-decretos", caminho: "decretos" },
  { endpoint: "portal-prestacao-contas", caminho: "pcsg" },
  { endpoint: "portal-faq", caminho: "perguntaserespostas" },
  { endpoint: "portal-glossario", caminho: "glossario" },
  { endpoint: "portal-beneficios", caminho: "processoprevidenciario" },
];

const COLEGIADOS_A_CADA_MS = 60 * 60_000;
const ultimaColeta = new Map<string, number>();

async function coletarExport(tenantId: string, base: string, ex: ExportPortal): Promise<ResultadoColeta> {
  try {
    const resp = await fetch(`${base}/${ex.caminho}/export?exp=json`, { signal: AbortSignal.timeout(30_000) });
    if (!resp.ok) throw new Error(`o portal respondeu HTTP ${resp.status}`);
    const texto = (await resp.text()).replace(/^\uFEFF/, "").trim();
    // página sem registros: o portal devolve uma mensagem de erro em vez de "[]" — não é falha
    let itens: Record<string, unknown>[] = [];
    if (texto.startsWith("[")) {
      const corpo = JSON.parse(texto) as unknown;
      if (Array.isArray(corpo)) itens = corpo.filter((i): i is Record<string, unknown> => Boolean(i) && typeof i === "object" && !Array.isArray(i));
    }
    const r = await sincronizarRegistros(tenantId, ex.endpoint, itens, true);
    return { codigo: ex.endpoint, ok: true, ...r };
  } catch (err) {
    return { codigo: ex.endpoint, ok: false, erro: err instanceof Error ? err.message : "erro desconhecido" };
  }
}

function limparTexto(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function dataBrParaIso(v: string): string {
  const m = v.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

interface LinhaAcao {
  Data: string;
  Descricao: string;
  Local: string;
  TipoAcao: string;
  Arquivo: string;
}

// "Lista de ações realizadas": a tabela com cabeçalho Data | Descrição | Local | Tipo | Mais
export function lerTabelaAcoes(html: string, base: string): { colegiado: string; linhas: LinhaAcao[] } {
  const limpo = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
  const cab = limpo.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
  const colegiado = cab ? limparTexto(cab[1]) : "";
  const linhas: LinhaAcao[] = [];
  for (const tabela of limpo.match(/<table[\s\S]*?<\/table>/gi) ?? []) {
    if (!/Data/i.test(tabela) || !/Descri/i.test(tabela) || !/<tbody/i.test(tabela)) continue;
    for (const tr of tabela.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
      const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
      if (tds.length < 4) continue;
      const href = tds[tds.length - 1].match(/href="([^"]+)"/i)?.[1] ?? "";
      let arquivo = "";
      try {
        arquivo = href ? new URL(href, `${base}/`).href : "";
      } catch {
        arquivo = "";
      }
      linhas.push({
        Data: dataBrParaIso(limparTexto(tds[0])),
        Descricao: limparTexto(tds[1]),
        Local: limparTexto(tds[2]),
        TipoAcao: limparTexto(tds[3]),
        Arquivo: arquivo,
      });
    }
  }
  return { colegiado, linhas };
}

async function coletarColegiados(tenantId: string, base: string): Promise<ResultadoColeta> {
  try {
    // quais colegiados e tipos de documento existem: vem dos próprios botões do portal (d=transparencia)
    const botoes = await buscarConjunto(base, "transparencia", "");
    const combos = new Map<string, { id: string; tipo: string; tipoNome: string; grupo: string }>();
    for (const b of botoes) {
      const m = String(b.Link ?? "").match(/conselhos\/(\d+)\?tipo=(\d+)/i);
      if (m) combos.set(`${m[1]}-${m[2]}`, { id: m[1], tipo: m[2], tipoNome: String(b.Descricao ?? "").trim(), grupo: String(b.Grupo ?? "").trim() });
    }
    if (combos.size === 0) return { codigo: ENDPOINT_COLEGIADOS, ok: true, total: 0, novos: 0, removidos: 0 };

    const registros: Record<string, unknown>[] = [];
    let completo = true;
    for (const c of combos.values()) {
      try {
        const resp = await fetch(`${base}/conselhos/${c.id}?tipo=${c.tipo}`, { signal: AbortSignal.timeout(30_000) });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const { colegiado, linhas } = lerTabelaAcoes(await resp.text(), base);
        for (const l of linhas) {
          registros.push({
            Colegiado: colegiado || c.grupo,
            ColegiadoId: c.id,
            TipoDocumentoId: c.tipo,
            TipoDocumento: c.tipoNome,
            ...l,
          });
        }
      } catch {
        completo = false; // alguma página falhou: grava o que veio, mas não marca nada como removido
      }
      await esperar(250);
    }
    const r = await sincronizarRegistros(tenantId, ENDPOINT_COLEGIADOS, registros, completo);
    return { codigo: ENDPOINT_COLEGIADOS, ok: true, ...r };
  } catch (err) {
    return { codigo: ENDPOINT_COLEGIADOS, ok: false, erro: err instanceof Error ? err.message : "erro desconhecido" };
  }
}

// Um conjunto por vez, com um respiro entre eles (o portal é de um órgão pequeno, não de um provedor de nuvem).
export async function coletarPortal(tenantId: string, base: string): Promise<ResultadoColeta[]> {
  const resultados: ResultadoColeta[] = [];
  for (const ds of DATASETS_PORTAL) {
    resultados.push(await coletarConjunto(tenantId, base, ds));
    await esperar(200);
  }
  for (const ex of EXPORTS_PORTAL) {
    resultados.push(await coletarExport(tenantId, base, ex));
    await esperar(200);
  }
  // colegiados: ~30 páginas, muda pouco — no máximo uma vez por hora
  const chave = `${tenantId}|colegiados`;
  if (Date.now() - (ultimaColeta.get(chave) ?? 0) > COLEGIADOS_A_CADA_MS) {
    const r = await coletarColegiados(tenantId, base);
    if (r.ok) ultimaColeta.set(chave, Date.now());
    resultados.push(r);
  }
  return resultados;
}

// só para os testes de conferência (scripts fora do projeto)
export { buscarConjunto as buscarConjuntoParaTeste };
