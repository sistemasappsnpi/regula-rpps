import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { CATALOGO_TRANSPARENCIA_API, NEXA_BASE_URL, type EndpointTransparenciaApi } from "./catalogo";

export interface ResultadoColeta {
  codigo: string;
  ok: boolean;
  total?: number;
  novos?: number;
  removidos?: number;
  erro?: string;
}

// JSON com chaves em ordem fixa: o mesmo registro sempre gera o mesmo hash, venha a API com os
// campos na ordem que vier.
function jsonEstavel(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(jsonEstavel).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${jsonEstavel(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

// A API manda datas como "dd/mm/aaaa" (às vezes ISO). Qualquer coisa que não seja uma data clara vira null.
export function lerData(v: unknown): Date | null {
  if (typeof v !== "string") return null;
  const br = v.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) {
    const d = new Date(Date.UTC(Number(br[3]), Number(br[2]) - 1, Number(br[1])));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const iso = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

const CAMPOS_DATA = ["data", "renovacao", "aprovacao", "data_validade", "inicio", "data_inicio", "credenciamento"];

function extrairAnoEReferencia(item: Record<string, unknown>): { ano: number | null; referencia: Date | null } {
  let referencia: Date | null = null;
  for (const campo of CAMPOS_DATA) {
    referencia = lerData(item[campo]);
    if (referencia) break;
  }
  const anoBruto = Number(item.ano);
  const ano = Number.isInteger(anoBruto) && anoBruto > 1900 && anoBruto < 2200 ? anoBruto : referencia ? referencia.getUTCFullYear() : null;
  return { ano, referencia };
}

async function buscarLista(chave: string, ep: EndpointTransparenciaApi): Promise<Record<string, unknown>[]> {
  const url = `${NEXA_BASE_URL}/${ep.caminho}?chave=${encodeURIComponent(chave)}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  // nunca coloca a URL (que leva a chave) na mensagem de erro
  if (!resp.ok) throw new Error(`a API respondeu HTTP ${resp.status}`);
  const corpo = (await resp.json()) as unknown;
  if (!Array.isArray(corpo)) throw new Error("resposta fora do formato esperado (não é uma lista)");
  return corpo.filter((i): i is Record<string, unknown> => Boolean(i) && typeof i === "object");
}

export async function coletarEndpoint(tenantId: string, chave: string, ep: EndpointTransparenciaApi): Promise<ResultadoColeta> {
  try {
    const itens = await buscarLista(chave, ep);
    const agora = new Date();

    const preparados = new Map<string, Prisma.TransparenciaApiRegistroCreateManyInput>();
    for (const item of itens) {
      const hash = createHash("sha1").update(jsonEstavel(item)).digest("hex");
      if (preparados.has(hash)) continue; // item idêntico repetido na própria resposta
      const { ano, referencia } = extrairAnoEReferencia(item);
      preparados.set(hash, { tenantId, endpoint: ep.codigo, hash, dados: item as Prisma.InputJsonObject, ano, referencia, vistoEm: agora });
    }

    const existentes = await prisma.transparenciaApiRegistro.findMany({
      where: { tenantId, endpoint: ep.codigo },
      select: { id: true, hash: true, removidoEm: true },
    });
    const hashesExistentes = new Set(existentes.map((e) => e.hash));

    const novos = [...preparados.values()].filter((p) => !hashesExistentes.has(p.hash));
    if (novos.length) await prisma.transparenciaApiRegistro.createMany({ data: novos, skipDuplicates: true });

    // vistos agora: atualiza vistoEm e "ressuscita" quem tinha sido marcado como removido
    const vistosIds = existentes.filter((e) => preparados.has(e.hash)).map((e) => e.id);
    if (vistosIds.length) {
      await prisma.transparenciaApiRegistro.updateMany({ where: { id: { in: vistosIds } }, data: { vistoEm: agora, removidoEm: null } });
    }

    // sumiu da API: mantém a cópia, só marca. (Só chega aqui se a API respondeu com sucesso —
    // erro de rede/contrato encerrado cai no catch e não marca nada.)
    const sumiramIds = existentes.filter((e) => !preparados.has(e.hash) && !e.removidoEm).map((e) => e.id);
    if (sumiramIds.length) {
      await prisma.transparenciaApiRegistro.updateMany({ where: { id: { in: sumiramIds } }, data: { removidoEm: agora } });
    }

    return { codigo: ep.codigo, ok: true, total: preparados.size, novos: novos.length, removidos: sumiramIds.length };
  } catch (err) {
    return { codigo: ep.codigo, ok: false, erro: err instanceof Error ? err.message : "erro desconhecido" };
  }
}

// Um endpoint por vez (mesma lição do pool de conexões em portal-previdenciario.routes.ts).
export async function coletarTudo(tenantId: string): Promise<ResultadoColeta[]> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { transparenciaApiChave: true } });
  if (!tenant) throw new HttpError(404, "RPPS não encontrado.");
  if (!tenant.transparenciaApiChave) throw new HttpError(400, "Este RPPS não tem a chave da API de Transparência cadastrada.");

  const resultados: ResultadoColeta[] = [];
  for (const ep of CATALOGO_TRANSPARENCIA_API) {
    resultados.push(await coletarEndpoint(tenantId, tenant.transparenciaApiChave, ep));
  }
  return resultados;
}
