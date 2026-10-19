import { createHash } from "node:crypto";
import { prisma } from "../../db/prisma";

// Cópia local dos PDFs/anexos apontados pelos registros da API Nexa (TransparenciaApiArquivo). Roda
// logo depois de cada coleta: baixa o que ainda não temos, aos poucos (orçamento de tempo por rodada),
// pra não segurar a API nem sobrecarregar o fornecedor.

const LIMITE_BYTES = 50 * 1024 * 1024;
const MAX_TENTATIVAS = 5;
// só baixa de servidores da própria Nexa — a lista de links vem de uma API externa e não pode virar
// um jeito de fazer o nosso servidor buscar endereço qualquer (rede interna, por exemplo)
const HOSTS_PERMITIDOS = [/(^|\.)nexasolucoes\.com\.br$/i];

export function hashUrl(url: string): string {
  return createHash("sha1").update(url).digest("hex");
}

// qualquer campo "link…" (linkArquivo, linkArquivo_ata, linkArquivoAta, linkaAquivo_Ata…) com URL http(s)
export function camposDeLink(dados: Record<string, unknown>): { campo: string; url: string }[] {
  const achados: { campo: string; url: string }[] = [];
  for (const [campo, valor] of Object.entries(dados)) {
    if (/^link/i.test(campo) && typeof valor === "string" && /^https?:\/\//i.test(valor.trim())) {
      achados.push({ campo, url: valor.trim() });
    }
  }
  return achados;
}

type Resultado =
  | { status: "OK"; nome: string; mime: string; conteudo: Buffer }
  | { status: "FALHA" | "IGNORADO"; erro: string };

function nomeDoArquivo(url: string): string {
  try {
    const ultimo = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "arquivo.pdf";
    return decodeURIComponent(ultimo).slice(0, 180);
  } catch {
    return "arquivo.pdf";
  }
}

async function baixar(url: string): Promise<Resultado> {
  let alvo: URL;
  try {
    alvo = new URL(url);
  } catch {
    return { status: "IGNORADO", erro: "URL inválida" };
  }
  if (alvo.protocol !== "https:" && alvo.protocol !== "http:") return { status: "IGNORADO", erro: "protocolo não suportado" };
  if (!HOSTS_PERMITIDOS.some((re) => re.test(alvo.hostname))) return { status: "IGNORADO", erro: `servidor fora da lista permitida (${alvo.hostname})` };

  try {
    const resp = await fetch(alvo.href, { signal: AbortSignal.timeout(90_000) });
    if (!resp.ok) return { status: "FALHA", erro: `HTTP ${resp.status}` };

    const declarado = Number(resp.headers.get("content-length") ?? 0);
    if (declarado > LIMITE_BYTES) return { status: "IGNORADO", erro: `maior que ${LIMITE_BYTES / 1024 / 1024} MB` };

    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length > LIMITE_BYTES) return { status: "IGNORADO", erro: `maior que ${LIMITE_BYTES / 1024 / 1024} MB` };
    // PDF de verdade tem o cabeçalho %PDF- nos primeiros bytes (alguns têm lixo antes dele)
    if (!buf.subarray(0, 1024).includes("%PDF-")) {
      return { status: "IGNORADO", erro: `não é PDF (${resp.headers.get("content-type") ?? "tipo desconhecido"})` };
    }
    return { status: "OK", nome: nomeDoArquivo(alvo.href), mime: "application/pdf", conteudo: buf };
  } catch (err) {
    return { status: "FALHA", erro: err instanceof Error ? err.message.slice(0, 300) : "erro desconhecido" };
  }
}

export interface StatusArquivos {
  total: number;
  baixados: number;
  pendentes: number;
  falhas: number;
  ignorados: number;
}

// todas as URLs distintas referenciadas pelos registros do tenant (inclusive os já removidos da API)
async function urlsDoTenant(tenantId: string): Promise<string[]> {
  const registros = await prisma.transparenciaApiRegistro.findMany({ where: { tenantId }, select: { dados: true } });
  const urls = new Set<string>();
  for (const r of registros) {
    if (r.dados && typeof r.dados === "object" && !Array.isArray(r.dados)) {
      for (const l of camposDeLink(r.dados as Record<string, unknown>)) urls.add(l.url);
    }
  }
  return [...urls];
}

export async function statusArquivos(tenantId: string): Promise<StatusArquivos> {
  const urls = await urlsDoTenant(tenantId);
  const linhas = await prisma.transparenciaApiArquivo.findMany({ where: { tenantId }, select: { urlHash: true, status: true, tentativas: true } });
  const porHash = new Map(linhas.map((l) => [l.urlHash, l]));
  let baixados = 0;
  let falhas = 0;
  let ignorados = 0;
  for (const u of urls) {
    const l = porHash.get(hashUrl(u));
    if (l?.status === "OK") baixados++;
    else if (l?.status === "IGNORADO") ignorados++;
    else if (l && l.tentativas >= MAX_TENTATIVAS) falhas++;
  }
  return { total: urls.length, baixados, ignorados, falhas, pendentes: urls.length - baixados - ignorados - falhas };
}

// Baixa o que falta, até estourar o orçamento de tempo. Devolve quantos baixou nesta rodada.
export async function baixarArquivosPendentes(tenantId: string, orcamentoMs: number): Promise<{ baixados: number; falhas: string[] }> {
  const inicio = Date.now();
  const urls = await urlsDoTenant(tenantId);
  const existentes = await prisma.transparenciaApiArquivo.findMany({ where: { tenantId }, select: { urlHash: true, status: true, tentativas: true, updatedAt: true } });
  const porHash = new Map(existentes.map((e) => [e.urlHash, e]));

  // nunca tentados primeiro, depois as falhas que ainda têm tentativa sobrando. Quem esgotou as tentativas
  // ainda é revisitado a cada 24h: se a fonte consertar o arquivo no mesmo endereço, ele volta sozinho.
  const UM_DIA = 24 * 60 * 60_000;
  const novos = urls.filter((u) => !porHash.has(hashUrl(u)));
  const repetir = urls.filter((u) => {
    const e = porHash.get(hashUrl(u));
    return e && e.status === "FALHA" && (e.tentativas < MAX_TENTATIVAS || Date.now() - e.updatedAt.getTime() > UM_DIA);
  });

  let baixados = 0;
  const falhas: string[] = [];
  for (const url of [...novos, ...repetir]) {
    if (Date.now() - inicio > orcamentoMs) break;
    const hash = hashUrl(url);
    const r = await baixar(url);
    const tentativasAntes = porHash.get(hash)?.tentativas ?? 0;

    if (r.status === "OK") {
      await prisma.transparenciaApiArquivo.upsert({
        where: { tenantId_urlHash: { tenantId, urlHash: hash } },
        create: { tenantId, urlHash: hash, urlOrigem: url, status: "OK", nome: r.nome, mime: r.mime, tamanho: r.conteudo.length, conteudo: r.conteudo, tentativas: tentativasAntes + 1, baixadoEm: new Date() },
        update: { status: "OK", nome: r.nome, mime: r.mime, tamanho: r.conteudo.length, conteudo: r.conteudo, erro: null, tentativas: tentativasAntes + 1, baixadoEm: new Date() },
      });
      baixados++;
    } else {
      await prisma.transparenciaApiArquivo.upsert({
        where: { tenantId_urlHash: { tenantId, urlHash: hash } },
        create: { tenantId, urlHash: hash, urlOrigem: url, status: r.status, erro: r.erro, tentativas: tentativasAntes + 1 },
        update: { status: r.status, erro: r.erro, tentativas: tentativasAntes + 1 },
      });
      falhas.push(`${r.status}: ${url} — ${r.erro}`);
    }
  }
  return { baixados, falhas };
}
