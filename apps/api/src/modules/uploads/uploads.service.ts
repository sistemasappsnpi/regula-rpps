import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { extrairCamposDoPdf, isAiConfigured } from "../ai/anthropic.client";
import { proGestaoRepository } from "../pro-gestao/pro-gestao.repository";
import { extrairTextoPorPagina } from "./pdf-extraction";

export async function processarUploadDeAcao(input: {
  tenantId: string;
  acaoCodigo: string;
  userId: string;
  nomeArquivo: string;
  caminhoArquivo: string;
  buffer: Buffer;
}) {
  const acao = await proGestaoRepository.getAcao(input.acaoCodigo);
  if (!acao) throw new HttpError(404, "Ação não encontrada.");

  const paginas = await extrairTextoPorPagina(input.buffer);

  const upload = await prisma.documentoUpload.create({
    data: {
      tenantId: input.tenantId,
      acaoCodigo: input.acaoCodigo,
      nomeArquivo: input.nomeArquivo,
      caminhoArquivo: input.caminhoArquivo,
      paginasTexto: JSON.stringify(paginas),
      status: "EXTRAIDO",
      uploadedByUserId: input.userId,
    },
  });

  if (!isAiConfigured()) {
    // Texto já extraído e disponível para consulta manual; sem IA configurada, nenhuma
    // sugestão de campo é gerada automaticamente (ver /docs/stack-proposta.md).
    return { upload, sugestoes: [], aiConfigured: false };
  }

  try {
    const resultados = await extrairCamposDoPdf(
      paginas,
      acao.campos.map((c) => ({ campoId: c.campoId, descricao: c.descricao })),
    );

    const sugestoesCriadas = [];
    for (const resultado of resultados) {
      if (!resultado.encontrado || !resultado.valor) continue;
      const campoDb = acao.campos.find((c) => c.campoId === resultado.campoId);
      if (!campoDb) continue;

      const sugestao = await prisma.campoExtraidoSugestao.create({
        data: {
          uploadId: upload.id,
          campoId: campoDb.id,
          valorSugerido: resultado.valor,
          paginaOrigem: resultado.pagina,
          trechoOrigem: resultado.trecho,
        },
      });
      sugestoesCriadas.push(sugestao);
    }

    return { upload, sugestoes: sugestoesCriadas, aiConfigured: true };
  } catch (err) {
    await prisma.documentoUpload.update({
      where: { id: upload.id },
      data: { status: "ERRO", erro: err instanceof Error ? err.message : "Erro desconhecido na extração por IA." },
    });
    return { upload, sugestoes: [], aiConfigured: true, erroExtracao: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Upload de evidência para um critério do CRP — deliberadamente mais simples que o upload de
 * ação do Pró-Gestão: não há "campos" estruturados nem extração assistida por IA aqui, porque
 * a verificação real do critério acontece nos sistemas federais (GESCON/CADPREV/SICONFI). Este
 * upload só organiza, dentro do sistema, a documentação/evidência que embasa cada critério —
 * não confundir com o motor de preenchimento do Pró-Gestão (são fluxos independentes, ver
 * conversa que definiu essa separação).
 */
/**
 * Upload de documento-fonte para o Construtor de Documentos: só extrai e guarda o texto, sem
 * campos estruturados nem sugestão de IA aqui — a IA só entra depois, quando o usuário escolhe
 * um tipo de documento e manda montar (ver construtor.repository.ts). O documento nasce sem
 * dono (construtorExecucaoId null) e é vinculado à execução só no momento da geração.
 */
export async function processarUploadDeConstrutor(input: {
  tenantId: string;
  userId: string;
  nomeArquivo: string;
  caminhoArquivo: string;
  buffer: Buffer;
}) {
  const paginas = await extrairTextoPorPagina(input.buffer);

  return prisma.documentoUpload.create({
    data: {
      tenantId: input.tenantId,
      nomeArquivo: input.nomeArquivo,
      caminhoArquivo: input.caminhoArquivo,
      paginasTexto: JSON.stringify(paginas),
      status: "EXTRAIDO",
      uploadedByUserId: input.userId,
    },
  });
}

export async function processarUploadDeCriterio(input: {
  tenantId: string;
  criterionCode: string;
  userId: string;
  descricao?: string;
  nomeArquivo: string;
  caminhoArquivo: string;
  buffer: Buffer;
}) {
  const criterio = await prisma.crpCriterion.findUnique({ where: { code: input.criterionCode } });
  if (!criterio) throw new HttpError(404, "Critério do CRP não encontrado.");

  const paginas = await extrairTextoPorPagina(input.buffer);

  return prisma.documentoUpload.create({
    data: {
      tenantId: input.tenantId,
      criterionCode: input.criterionCode,
      descricao: input.descricao ?? null,
      nomeArquivo: input.nomeArquivo,
      caminhoArquivo: input.caminhoArquivo,
      paginasTexto: JSON.stringify(paginas),
      status: "EXTRAIDO",
      uploadedByUserId: input.userId,
    },
  });
}
