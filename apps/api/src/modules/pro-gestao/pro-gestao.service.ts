import type { FieldOrigin, NivelAderencia } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { comporRascunho, isAiConfigured } from "../ai/anthropic.client";
import { nivelAlcanca, proGestaoRepository } from "./pro-gestao.repository";

export interface FonteReadiness {
  fonteCodigo: string;
  fonteNome: string;
  tipoRelacao: string;
  satisfeita: boolean;
  camposFaltando: string[];
}

/**
 * Registra uma nova versão de um campo (nunca sobrescreve a anterior) e, se essa mudança
 * tornar desatualizado algum documento composto já aprovado que citava a versão antiga,
 * marca-o como tal. É o único ponto de entrada de escrita de campo do Pró-Gestão — tanto o
 * preenchimento manual quanto a aprovação de uma sugestão extraída de PDF passam por aqui.
 */
export async function registrarValorDeCampo(input: {
  tenantId: string;
  campoDbId: string;
  valor: string;
  origem: FieldOrigin;
  origemDetalhe?: string | null;
  userId: string;
}) {
  const created = await proGestaoRepository.setCampoValor(input);
  await proGestaoRepository.marcarCompostosDesatualizadosPorCampo(input.tenantId, input.campoDbId, created.id);
  return created;
}

/**
 * "Fonte satisfeita" (ver /docs/modelo-de-dados.md) = todo campo da ação-fonte exigido até o
 * nível já alcançado pelo tenant nessa fonte (ou nível I, se o tenant ainda não selecionou
 * nenhum nível) tem um valor preenchido.
 */
export async function calcularProntidaoDeFontes(tenantId: string, acaoCompostaCodigo: string): Promise<FonteReadiness[]> {
  const acao = await proGestaoRepository.getAcao(acaoCompostaCodigo);
  if (!acao) throw new HttpError(404, "Ação não encontrada.");

  const resultado: FonteReadiness[] = [];

  for (const dep of acao.dependeDe) {
    const fonte = dep.fonte;
    const statusFonte = await proGestaoRepository.tenantAcaoStatus(tenantId, fonte.codigo);
    const nivelReferencia: NivelAderencia = statusFonte?.nivelAtual ?? "I";

    const camposExigidos = fonte.campos.filter((c) => nivelAlcanca(c.nivelMinimo, nivelReferencia));
    const valores = await proGestaoRepository.currentValues(
      tenantId,
      camposExigidos.map((c) => c.id),
    );
    const preenchidos = new Set(valores.map((v) => v.campoId));

    const camposFaltando = camposExigidos.filter((c) => !preenchidos.has(c.id)).map((c) => c.descricao);

    resultado.push({
      fonteCodigo: fonte.codigo,
      fonteNome: fonte.nome,
      tipoRelacao: dep.tipoRelacao,
      satisfeita: camposFaltando.length === 0 && camposExigidos.length > 0,
      camposFaltando,
    });
  }

  return resultado;
}

/**
 * Gera (ou regenera) o rascunho do documento composto usando apenas as fontes já satisfeitas.
 * Fontes ainda pendentes aparecem separadamente na resposta, nunca bloqueiam a geração parcial —
 * decisão de escopo do MVP: com o piloto tendo só 1 de N fontes implementadas, exigir todas
 * as fontes prontas impediria testar o motor de ponta a ponta (ver aviso ao usuário no relatório).
 * O rascunho gerado NUNCA vira documento oficial sozinho: fica em status RASCUNHO até aprovação
 * humana explícita via aprovarRascunho().
 */
export async function gerarRascunho(tenantId: string, acaoCompostaCodigo: string, userId: string) {
  const acao = await proGestaoRepository.getAcao(acaoCompostaCodigo);
  if (!acao) throw new HttpError(404, "Ação não encontrada.");

  const prontidao = await calcularProntidaoDeFontes(tenantId, acaoCompostaCodigo);
  const fontesProntas = prontidao.filter((f) => f.satisfeita);
  if (fontesProntas.length === 0) {
    throw new HttpError(400, "Nenhuma ação-fonte está pronta ainda — preencha ao menos uma fonte antes de gerar o rascunho.");
  }

  const fontesParaComposicao = [];
  const baseadoEm: { campoDbId: string; valorId: string }[] = [];

  for (const fontePronta of fontesProntas) {
    const fonteAcao = acao.dependeDe.find((d) => d.fonteCodigo === fontePronta.fonteCodigo)!.fonte;
    const statusFonte = await proGestaoRepository.tenantAcaoStatus(tenantId, fonteAcao.codigo);
    const nivelReferencia: NivelAderencia = statusFonte?.nivelAtual ?? "I";
    const camposExigidos = fonteAcao.campos.filter((c) => nivelAlcanca(c.nivelMinimo, nivelReferencia));
    const valores = await proGestaoRepository.currentValues(tenantId, camposExigidos.map((c) => c.id));

    const camposComValor = camposExigidos
      .map((campo) => {
        const valor = valores.find((v) => v.campoId === campo.id);
        if (!valor) return null;
        baseadoEm.push({ campoDbId: campo.id, valorId: valor.id });
        return { campoId: campo.campoId, descricao: campo.descricao, valor: valor.valor };
      })
      .filter((c): c is { campoId: string; descricao: string; valor: string } => c !== null);

    fontesParaComposicao.push({ acaoNome: fonteAcao.nome, acaoCodigo: fonteAcao.codigo, campos: camposComValor });
  }

  const itens = isAiConfigured()
    ? await comporRascunho(acao.nome, fontesParaComposicao)
    : fontesParaComposicao.flatMap((f) =>
        f.campos.map((c) => ({
          descricao: c.descricao,
          valor: c.valor,
          fonteAcaoCodigo: f.acaoCodigo,
          fonteCampoId: c.campoId,
        })),
      );

  const composto = await proGestaoRepository.upsertDocumentoComposto({
    tenantId,
    acaoCodigo: acaoCompostaCodigo,
    conteudo: JSON.stringify(itens),
    baseadoEmValorIds: JSON.stringify(baseadoEm),
  });

  return {
    composto,
    itens,
    geradoSemIa: !isAiConfigured(),
    fontesPendentes: prontidao.filter((f) => !f.satisfeita),
  };
}

export async function aprovarRascunho(tenantId: string, acaoCodigo: string, userId: string) {
  const composto = await proGestaoRepository.getDocumentoComposto(tenantId, acaoCodigo);
  if (!composto) throw new HttpError(404, "Nenhum rascunho gerado para esta ação ainda.");
  if (composto.status === "APROVADO") {
    throw new HttpError(400, "Este documento já está aprovado.");
  }
  return proGestaoRepository.aprovarDocumentoComposto(tenantId, acaoCodigo, userId);
}
