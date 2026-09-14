import type { FieldOrigin } from "@prisma/client";
import { HttpError } from "../../middleware/errorHandler";
import { portalIndicadoresRepository } from "./portal-indicadores.repository";

/** Converte "YYYY-MM" (ou "YYYY-MM-DD") num Date normalizado pro 1º dia do mês em UTC. */
export function normalizarCompetencia(competencia: string): Date {
  const match = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(competencia.trim());
  if (!match) throw new HttpError(400, 'Competência inválida — use o formato "AAAA-MM".');
  const ano = Number(match[1]);
  const mes = Number(match[2]);
  if (mes < 1 || mes > 12) throw new HttpError(400, "Competência inválida — mês fora do intervalo 1-12.");
  return new Date(Date.UTC(ano, mes - 1, 1));
}

function validarValorPorTipo(tipo: string, valor: string): void {
  const v = valor.trim();
  if (!v) throw new HttpError(400, "Valor não pode ser vazio.");

  if (tipo === "NUMERICO" || tipo === "MOEDA") {
    const normalizado = v.replace(/\./g, "").replace(",", ".");
    if (Number.isNaN(Number(normalizado))) {
      throw new HttpError(400, `Valor "${valor}" não é um número válido para este indicador.`);
    }
    return;
  }

  if (tipo === "DATA") {
    // dd/mm/aaaa (formato que a IA usa, espelhando o documento-fonte) ou aaaa-mm-dd (lançamento
    // manual/ISO), com horário opcional (ex.: timestamp de assinatura digital "28/04/2026
    // 16:21:57") — Date.parse() não serve aqui, não reconhece dd/mm/aaaa de forma confiável.
    const br = /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.exec(v);
    const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.exec(v);
    const m = br ?? iso;
    if (!m) {
      throw new HttpError(400, `Valor "${valor}" não é uma data válida (use dd/mm/aaaa) para este indicador.`);
    }
    const [dia, mes, ano] = br ? [Number(m[1]), Number(m[2]), Number(m[3])] : [Number(m[3]), Number(m[2]), Number(m[1])];
    const data = new Date(Date.UTC(ano, mes - 1, dia));
    const valida = data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
    if (!valida) {
      throw new HttpError(400, `Valor "${valor}" não é uma data válida para este indicador.`);
    }
    return;
  }

  // TEXTO: qualquer string não vazia já é válida (checado acima).
}

/**
 * Único ponto de escrita de TenantPortalIndicadorValor — usado tanto pelo lançamento manual
 * (origem MANUAL) quanto pela aprovação de uma sugestão extraída de PDF pelo Construtor de
 * Documentos (origem PDF_EXTRACTION, ver construtor.routes.ts). Valida o valor contra o tipo
 * cadastrado no catálogo (PortalIndicador.tipo) antes de gravar — diferença em relação ao
 * Pró-Gestão, onde ProGestaoCampo não é tipado.
 */
export async function registrarValorDeIndicador(input: {
  tenantId: string;
  indicadorDbId: string;
  competencia: Date;
  valor: string;
  origem: FieldOrigin;
  origemDetalhe?: string | null;
  documentoUploadId?: string | null;
  userId: string;
}) {
  const indicador = await portalIndicadoresRepository.findIndicadorById(input.indicadorDbId);
  if (!indicador) throw new HttpError(404, "Indicador não encontrado.");

  validarValorPorTipo(indicador.tipo, input.valor);

  return portalIndicadoresRepository.setIndicadorValor(input);
}

/**
 * Registra UMA ocorrência de um indicador "grupo" (com subcampos, ex.: um membro de comitê) —
 * irmã de registrarValorDeIndicador, mas cria uma TenantPortalIndicadorInstancia com N valores
 * de subcampo em vez de um único TenantPortalIndicadorValor. Válida cada subcampo contra o tipo
 * cadastrado (PortalIndicadorSubcampo.tipo), mesma regra de sempre.
 */
export async function registrarInstanciaDeIndicadorGrupo(input: {
  tenantId: string;
  indicadorDbId: string;
  competencia: Date;
  subcampoValores: { subcampoId: string; valor: string; origemDetalhe?: string | null }[];
  origem: FieldOrigin;
  documentoUploadId?: string | null;
  userId: string;
}) {
  const indicador = await portalIndicadoresRepository.findIndicadorComSubcampos(input.indicadorDbId);
  if (!indicador) throw new HttpError(404, "Indicador não encontrado.");
  if (indicador.subcampos.length === 0) throw new HttpError(400, "Este indicador não tem subcampos configurados.");

  const subcampoPorId = new Map(indicador.subcampos.map((s) => [s.id, s]));
  for (const sv of input.subcampoValores) {
    const subcampo = subcampoPorId.get(sv.subcampoId);
    if (!subcampo) throw new HttpError(400, `Subcampo "${sv.subcampoId}" não pertence a este indicador.`);
    validarValorPorTipo(subcampo.tipo, sv.valor);
  }

  return portalIndicadoresRepository.setInstanciaDeIndicadorGrupo(input);
}
