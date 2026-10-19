import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";

// Gravação da cópia local (TransparenciaApiRegistro), comum às duas fontes: a API Nexa do manual (com
// chave) e os dados abertos do portal de transparência do órgão (sem chave).

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
export function jsonEstavel(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(jsonEstavel).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${jsonEstavel(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

// As APIs mandam datas como "dd/mm/aaaa" (Nexa) ou ISO (portal). Qualquer coisa que não seja uma data clara vira null.
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

// nomes de campo comparados sem diferenciar maiúscula (a Nexa usa "data", o portal usa "Data")
const CAMPOS_DATA = [
  "data", "dataabertura", "datacontrato", "datacriacao", "vigenciainicio", "renovacao", "aprovacao",
  "data_validade", "inicio", "data_inicio", "credenciamento",
];
const CAMPOS_ANO = ["ano", "exercicio"];

function extrairAnoEReferencia(item: Record<string, unknown>): { ano: number | null; referencia: Date | null } {
  const minusculo = new Map<string, unknown>();
  for (const [k, v] of Object.entries(item)) minusculo.set(k.toLowerCase(), v);

  let referencia: Date | null = null;
  for (const campo of CAMPOS_DATA) {
    referencia = lerData(minusculo.get(campo));
    if (referencia) break;
  }
  let ano: number | null = null;
  for (const campo of CAMPOS_ANO) {
    const n = Number(minusculo.get(campo));
    if (Number.isInteger(n) && n > 1900 && n < 2200) {
      ano = n;
      break;
    }
  }
  if (ano === null && referencia) ano = referencia.getUTCFullYear();
  return { ano, referencia };
}

/**
 * Grava uma lista de registros de um endpoint/conjunto de dados.
 * `marcarRemovidos`: só quando a lista é COMPLETA — o que não veio ganha removidoEm (a cópia fica, só some da
 * página pública). Com lista parcial (ex.: só os 200 mais novos) nunca se marca ninguém como removido.
 */
export async function sincronizarRegistros(
  tenantId: string,
  codigo: string,
  itens: Record<string, unknown>[],
  marcarRemovidos: boolean,
): Promise<{ total: number; novos: number; removidos: number }> {
  const agora = new Date();

  const preparados = new Map<string, Prisma.TransparenciaApiRegistroCreateManyInput>();
  for (const item of itens) {
    const hash = createHash("sha1").update(jsonEstavel(item)).digest("hex");
    if (preparados.has(hash)) continue; // item idêntico repetido na própria resposta
    const { ano, referencia } = extrairAnoEReferencia(item);
    preparados.set(hash, { tenantId, endpoint: codigo, hash, dados: item as Prisma.InputJsonObject, ano, referencia, vistoEm: agora });
  }

  const existentes = await prisma.transparenciaApiRegistro.findMany({
    where: { tenantId, endpoint: codigo },
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

  // sumiu da fonte: mantém a cópia, só marca. Só com lista completa e NÃO vazia (resposta vazia por falha
  // momentânea da fonte não pode esconder tudo).
  let removidos = 0;
  if (marcarRemovidos && preparados.size > 0) {
    const sumiramIds = existentes.filter((e) => !preparados.has(e.hash) && !e.removidoEm).map((e) => e.id);
    if (sumiramIds.length) {
      await prisma.transparenciaApiRegistro.updateMany({ where: { id: { in: sumiramIds } }, data: { removidoEm: agora } });
    }
    removidos = sumiramIds.length;
  }

  return { total: preparados.size, novos: novos.length, removidos };
}
