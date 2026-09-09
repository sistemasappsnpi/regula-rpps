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
    if (Number.isNaN(Date.parse(v))) {
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
  userId: string;
}) {
  const indicador = await portalIndicadoresRepository.findIndicadorById(input.indicadorDbId);
  if (!indicador) throw new HttpError(404, "Indicador não encontrado.");

  validarValorPorTipo(indicador.tipo, input.valor);

  return portalIndicadoresRepository.setIndicadorValor(input);
}
