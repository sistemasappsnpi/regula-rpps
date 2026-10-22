// Verificador de links quebrados do Portal da Transparência de cada cliente (aba do gerador).
// Mesma ideia do link-check.php que acompanha o pacote publicado, mas roda aqui no Regula: serve
// também para portais cadastrados pelo link, que não têm o pacote PHP.

import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { apiUrlDe, baixarJson, slug } from "./gerador.service";
import { statusDoLink } from "./http";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cfg = Record<string, any>;

export interface UsoLink {
  grupo: string;
  descricao: string;
}

export interface LinkProblema {
  href: string;
  /** 0 = sem resposta (domínio fora do ar, timeout, endereço não permitido). */
  status: number;
  /** "quebrado": 404/410/5xx/sem resposta. "restrito": 401/403/429 — o site pode só estar recusando o verificador. */
  tipo: "quebrado" | "restrito";
  usos: UsoLink[];
}

export interface RelatorioLinks {
  verificadoEm: string;
  origem: "api" | "cache";
  totalLinks: number;
  quebrados: number;
  restritos: number;
  semLink: number;
  itensQuebrados: LinkProblema[];
  itensRestritos: LinkProblema[];
  itensSemLink: UsoLink[];
}

export interface Andamento {
  andamento: boolean;
  feitos: number;
  total: number;
  erro?: string;
}

/** Mesma regra do `fixLink` do portal (app.js): endereço completo, sem barras duplicadas, relativo = domínio dos links. */
export function corrigirLink(bruto: unknown, base: string): string {
  let raw = typeof bruto === "string" ? bruto.trim() : "";
  if (raw === "") return "#";
  if (/^(mailto:|tel:|#)/i.test(raw)) return raw;
  if (/^https?:\/\//i.test(raw)) {
    const aninhado = raw.slice(8).search(/https?:\/\//i);
    if (aninhado !== -1) return raw.slice(8 + aninhado);
    return raw.replace(/([^:])\/{2,}/g, "$1/");
  }
  if (base === "") return raw;
  raw = `${base}/${raw}`;
  return raw.replace(/([^:])\/{2,}/g, "$1/");
}

/** Agrupa os itens por endereço (um link usado em vários botões é verificado uma vez) e separa os sem link. */
export function agruparLinks(itens: Cfg[], base: string): { porHref: Map<string, UsoLink[]>; semLink: UsoLink[] } {
  const porHref = new Map<string, UsoLink[]>();
  const semLink: UsoLink[] = [];
  for (const it of itens) {
    if (!it || typeof it !== "object") continue;
    const uso = { grupo: String(it.Grupo ?? ""), descricao: String(it.Descricao ?? "") };
    const href = corrigirLink(it.Link, base);
    if (href === "#") {
      semLink.push(uso);
      continue;
    }
    if (!/^https?:\/\//i.test(href)) continue; // mailto:, tel:, âncoras: não há o que verificar
    const lista = porHref.get(href) ?? [];
    lista.push(uso);
    porHref.set(href, lista);
  }
  return { porHref, semLink };
}

export function classificar(status: number): "ok" | "quebrado" | "restrito" {
  if (status >= 200 && status < 400) return "ok";
  if (status === 401 || status === 403 || status === 429) return "restrito";
  return "quebrado";
}

/** Verifica os endereços com `simultaneos` requisições em paralelo. `checar` é injetável para teste. */
export async function verificarEnderecos(
  hrefs: string[],
  checar: (url: string) => Promise<number>,
  simultaneos = 8,
  aoAndar?: (feitos: number) => void,
): Promise<Map<string, number>> {
  const resultado = new Map<string, number>();
  let proximo = 0;
  let feitos = 0;
  const trabalhador = async () => {
    while (proximo < hrefs.length) {
      const href = hrefs[proximo++];
      resultado.set(href, await checar(href));
      aoAndar?.(++feitos);
    }
  };
  await Promise.all(Array.from({ length: Math.min(simultaneos, hrefs.length) }, trabalhador));
  return resultado;
}

/* ---------- execução em segundo plano (centenas de links levam minutos; a requisição não espera) ---------- */

const emAndamento = new Map<string, Andamento>();
const execucoes = new Map<string, Promise<void>>();

export function andamentoDe(pasta: string): Andamento {
  return emAndamento.get(slug(pasta)) ?? { andamento: false, feitos: 0, total: 0 };
}

export async function ultimoRelatorio(pasta: string): Promise<RelatorioLinks | null> {
  const p = await prisma.transparenciaPortal.findUnique({ where: { pasta: slug(pasta) } });
  if (!p) throw new HttpError(404, "Cliente não encontrado.");
  return (p.relatorioLinks as RelatorioLinks | null) ?? null;
}

async function itensDoPortal(p: { config: unknown; cacheTransparencia: string | null }): Promise<{ itens: Cfg[]; origem: "api" | "cache" }> {
  const config = p.config as Cfg;
  let itens: Cfg[] | null = null;
  let origem: "api" | "cache" = "api";
  const url = apiUrlDe((config.api ?? {}) as Cfg, "transparencia");
  if (url) itens = (await baixarJson(url)).data as Cfg[] | null;
  if (!itens && p.cacheTransparencia) {
    try {
      itens = JSON.parse(p.cacheTransparencia) as Cfg[];
      origem = "cache";
    } catch {
      /* cópia ilegível: cai no erro abaixo */
    }
  }
  if (!itens) throw new HttpError(502, "Não consegui obter os links: a API do cliente não respondeu e não há cópia salva.");
  const extras = Array.isArray(config.itensExtras) ? (config.itensExtras as Cfg[]).filter((e) => e?.Grupo && e?.Descricao) : [];
  return { itens: [...itens, ...extras], origem };
}

/** Dispara a verificação em segundo plano. Se já houver uma rodando para o portal, só devolve o andamento dela. */
export async function iniciarVerificacao(pastaEntrada: string): Promise<Andamento> {
  const pasta = slug(pastaEntrada);
  const atual = emAndamento.get(pasta);
  if (atual?.andamento) return atual;

  const p = await prisma.transparenciaPortal.findUnique({ where: { pasta } });
  if (!p) throw new HttpError(404, "Cliente não encontrado.");
  const config = p.config as Cfg;
  const { itens, origem } = await itensDoPortal(p);
  const base = String(config.api?.dominioLinks || config.api?.base || "").replace(/\/+$/, "");
  const { porHref, semLink } = agruparLinks(itens, base);
  const hrefs = [...porHref.keys()];

  const estado: Andamento = { andamento: true, feitos: 0, total: hrefs.length };
  emAndamento.set(pasta, estado);

  const execucao = (async () => {
    try {
      const status = await verificarEnderecos(hrefs, (u) => statusDoLink(u), 8, (n) => {
        estado.feitos = n;
      });
      const quebrados: LinkProblema[] = [];
      const restritos: LinkProblema[] = [];
      for (const href of hrefs) {
        const s = status.get(href) ?? 0;
        const tipo = classificar(s);
        if (tipo === "ok") continue;
        (tipo === "quebrado" ? quebrados : restritos).push({ href, status: s, tipo, usos: porHref.get(href) ?? [] });
      }
      const relatorio: RelatorioLinks = {
        verificadoEm: new Date().toISOString(), origem, totalLinks: hrefs.length,
        quebrados: quebrados.length, restritos: restritos.length, semLink: semLink.length,
        itensQuebrados: quebrados, itensRestritos: restritos, itensSemLink: semLink,
      };
      await prisma.transparenciaPortal.update({ where: { pasta }, data: { relatorioLinks: relatorio as unknown as object } });
      estado.andamento = false;
    } catch (err) {
      console.error("verificação de links falhou", err);
      estado.andamento = false;
      estado.erro = "A verificação falhou no meio do caminho. Tente de novo.";
    }
  })();
  execucoes.set(pasta, execucao);
  return estado;
}

/* ---------- verificação automática ---------- */

const INTERVALO_VERIFICACAO_MS = 60 * 60_000;
let verificacaoAgendadaRodando = false;

// A cada 1 h verifica os links de todos os portais cadastrados, um de cada vez (não sobrecarrega os servidores
// dos clientes). Roda dentro do próprio processo da API, como a coleta da Transparência API: se uma rodada
// passar de 1 h, a seguinte espera em vez de empilhar.
export function iniciarVerificacaoAgendada(): void {
  const rodar = async () => {
    if (verificacaoAgendadaRodando) return;
    verificacaoAgendadaRodando = true;
    try {
      const portais = await prisma.transparenciaPortal.findMany({ select: { pasta: true } });
      for (const { pasta } of portais) {
        try {
          const estado = await iniciarVerificacao(pasta);
          if (!estado.andamento) continue;
          await execucoes.get(pasta);
          console.log(`[links] ${pasta}: ${andamentoDe(pasta).total} links verificados`);
        } catch (err) {
          // um portal sem API nem cópia não pode impedir a verificação dos outros
          console.error(`[links] ${pasta}:`, err instanceof Error ? err.message : err);
        }
      }
    } catch (err) {
      console.error("[links] verificação agendada falhou:", err instanceof Error ? err.message : err);
    } finally {
      verificacaoAgendadaRodando = false;
    }
  };
  setTimeout(rodar, 2 * 60_000).unref();
  setInterval(rodar, INTERVALO_VERIFICACAO_MS).unref();
}
