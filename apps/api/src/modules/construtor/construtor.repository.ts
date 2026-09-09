import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";
import {
  montarDocumentoConstrutor,
  extrairIndicadoresDoPdf,
  isAiConfigured,
  type DocumentoFonteConstrutor,
} from "../ai/anthropic.client";
import { nivelAlcanca } from "../pro-gestao/pro-gestao.repository";
import { isFeatureEnabledForUser } from "../../middleware/features";
import { normalizarCompetencia } from "../portal-indicadores/portal-indicadores.service";

/**
 * Monta o "contexto normativo" que a IA recebe para entender o que um tipo de documento
 * exige, a partir da referência configurada pelo admin (ver ConstrutorTipoDocumento):
 * - PRO_GESTAO: objetivo da ação + descrição de cada campo (o que já temos no catálogo,
 *   ver knowledge-base/pro-gestao-acoes.json — não há texto integral do Manual no sistema
 *   hoje, então isto é a melhor aproximação disponível).
 * - CRP: descrição + base legal do critério.
 * - LIVRE: sem referência — a IA segue só o prompt do admin.
 */
async function montarContextoManual(tipo: { referenciaTipo: string; acaoCodigo: string | null; criterionCode: string | null }) {
  if (tipo.referenciaTipo === "PRO_GESTAO" && tipo.acaoCodigo) {
    const acao = await prisma.proGestaoAcao.findUnique({
      where: { codigo: tipo.acaoCodigo },
      include: { campos: { orderBy: { sortOrder: "asc" } } },
    });
    if (!acao) return "";
    const campos = acao.campos.map((c) => `- ${c.descricao}`).join("\n");
    return `Ação do Pró-Gestão RPPS "${acao.nome}" (${acao.numero}).\nObjetivo: ${acao.objetivo}\n\nO que este documento normalmente precisa reunir:\n${campos}`;
  }

  if (tipo.referenciaTipo === "CRP" && tipo.criterionCode) {
    const criterio = await prisma.crpCriterion.findUnique({ where: { code: tipo.criterionCode } });
    if (!criterio) return "";
    return `Critério do CRP "${criterio.title}".\nO que ele significa: ${criterio.description}\nBase legal: ${criterio.legalBasis}`;
  }

  return "";
}

export const construtorRepository = {
  /**
   * Tipos "PRO_GESTAO" só aparecem para o tenant se a ação ligada tiver pelo menos um campo
   * dentro do alcance do nível que o Admin Global configurou para ele (Tenant.nivelProGestaoAlvo
   * — mesmo gate usado em /documentos, ver DocumentoDetalhePage e nivelAlcanca). Tipos CRP e
   * LIVRE não são afetados por nível (conceito exclusivo do Pró-Gestão) — só pelo plano
   * contratado, já checado pelo requireFeature("construtor_documentos") na rota.
   */
  async listTiposAtivos(tenantId: string, userId: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { nivelProGestaoAlvo: true } });
    const nivelAlvo = tenant?.nivelProGestaoAlvo ?? "I";

    const tipos = await prisma.construtorTipoDocumento.findMany({
      where: { ativo: true },
      orderBy: { sortOrder: "asc" },
      include: {
        acao: { select: { nome: true, campos: { select: { nivelMinimo: true } } } },
        criterion: { select: { title: true } },
        portalDocumento: { select: { nome: true } },
      },
    });

    // Tipos PORTAL_PREVIDENCIARIO exigem a feature própria além de construtor_documentos (já
    // checada no middleware da rota) — mesmo espírito do filtro por nível abaixo para PRO_GESTAO.
    const podeIndicadores = await isFeatureEnabledForUser(userId, tenantId, "portal_previdenciario_indicadores");

    return tipos
      .filter((t) => {
        if (t.referenciaTipo === "PORTAL_PREVIDENCIARIO") return podeIndicadores;
        if (t.referenciaTipo !== "PRO_GESTAO" || !t.acao) return true;
        if (t.acao.campos.length === 0) return true;
        return t.acao.campos.some((c) => nivelAlcanca(c.nivelMinimo, nivelAlvo));
      })
      .map((t) => ({
        id: t.id,
        nome: t.nome,
        referenciaTipo: t.referenciaTipo,
        referenciaNome: t.acao?.nome ?? t.criterion?.title ?? t.portalDocumento?.nome ?? null,
      }));
  },

  /**
   * Gera uma nova execução do Construtor: busca o tipo de documento e o contexto normativo
   * ligado a ele, junta o texto já extraído dos documentos-fonte escolhidos (sem limite de
   * quantidade — precisam só pertencer a este tenant) e chama a IA. Nunca publica sozinho — a
   * execução nasce sempre RASCUNHO (mesmo padrão do documento composto do Pró-Gestão, ver
   * pro-gestao.repository.ts).
   */
  async gerarExecucao(input: { tenantId: string; userId: string; tipoDocumentoId: string; documentoUploadIds: string[] }) {
    if (!isAiConfigured()) {
      throw new HttpError(503, "O Construtor de Documentos exige IA configurada, e a chave da Anthropic API não está definida neste servidor.");
    }
    if (input.documentoUploadIds.length === 0) {
      throw new HttpError(400, "Selecione pelo menos 1 documento-fonte.");
    }

    const tipo = await prisma.construtorTipoDocumento.findUnique({ where: { id: input.tipoDocumentoId } });
    if (!tipo || !tipo.ativo) throw new HttpError(404, "Tipo de documento não encontrado.");

    const documentos = await prisma.documentoUpload.findMany({
      where: { id: { in: input.documentoUploadIds }, tenantId: input.tenantId },
    });
    if (documentos.length !== input.documentoUploadIds.length) {
      throw new HttpError(404, "Algum documento-fonte não foi encontrado para este RPPS.");
    }

    if (tipo.referenciaTipo === "PORTAL_PREVIDENCIARIO") {
      return construtorRepository.gerarExecucaoPortalIndicadores(input, tipo, documentos);
    }

    const contextoManual = await montarContextoManual(tipo);

    const documentosFonte: DocumentoFonteConstrutor[] = documentos.map((d) => ({
      nome: d.nomeArquivo,
      paginas: JSON.parse(d.paginasTexto) as { pagina: number; texto: string }[],
    }));

    const resultado = await montarDocumentoConstrutor({
      nomeDocumento: tipo.nome,
      contextoManual,
      promptInstrucoes: tipo.promptInstrucoes,
      documentosFonte,
    });

    const execucao = await prisma.tenantConstrutorExecucao.create({
      data: {
        tenantId: input.tenantId,
        tipoDocumentoId: tipo.id,
        conteudo: resultado.conteudo,
        citacoes: JSON.stringify(resultado.citacoes),
        geradoPorUserId: input.userId,
      },
    });

    await prisma.documentoUpload.updateMany({
      where: { id: { in: input.documentoUploadIds } },
      data: { construtorExecucaoId: execucao.id },
    });

    return construtorRepository.getExecucao(input.tenantId, execucao.id);
  },

  /**
   * Caminho de geração para tipos PORTAL_PREVIDENCIARIO: em vez de montar um texto único citando
   * fontes, extrai {indicador, competência, valor} de cada PDF-fonte (um indicador pode aparecer
   * várias vezes, uma por competência) e cria uma ConstrutorIndicadorSugestao por resultado
   * encontrado, pra revisão humana item a item (mesmo requisito de "nunca aprovar tudo em lote"
   * do resto do sistema, ver uploads.routes.ts). conteudo/citacoes ficam vazios — o conteúdo de
   * verdade desta execução mora nas sugestões.
   */
  async gerarExecucaoPortalIndicadores(
    input: { tenantId: string; userId: string; tipoDocumentoId: string; documentoUploadIds: string[] },
    tipo: { id: string; portalDocumentoId: string | null },
    documentos: { id: string; nomeArquivo: string; paginasTexto: string }[],
  ) {
    if (!tipo.portalDocumentoId) {
      throw new HttpError(404, "Este tipo de documento não está ligado a nenhum documento do Portal Previdenciário.");
    }

    const portalDocumento = await prisma.portalDocumento.findUnique({
      where: { id: tipo.portalDocumentoId },
      include: { indicadores: true },
    });
    if (!portalDocumento) throw new HttpError(404, "Documento do Portal Previdenciário não encontrado.");
    if (portalDocumento.indicadores.length === 0) {
      throw new HttpError(400, "Este documento ainda não tem nenhum indicador cadastrado no catálogo.");
    }

    const indicadoresParaExtrair = portalDocumento.indicadores.map((i) => ({
      indicadorId: i.indicadorId,
      nome: i.nome,
      tipo: i.tipo,
      unidade: i.unidade,
    }));

    const execucao = await prisma.tenantConstrutorExecucao.create({
      data: {
        tenantId: input.tenantId,
        tipoDocumentoId: tipo.id,
        conteudo: "",
        citacoes: "[]",
        geradoPorUserId: input.userId,
      },
    });

    for (const documento of documentos) {
      const paginas = JSON.parse(documento.paginasTexto) as { pagina: number; texto: string }[];
      const resultados = await extrairIndicadoresDoPdf(documento.nomeArquivo, paginas, indicadoresParaExtrair);

      for (const resultado of resultados) {
        if (!resultado.encontrado || !resultado.valor || !resultado.competencia) continue;
        const indicadorDb = portalDocumento.indicadores.find((i) => i.indicadorId === resultado.indicadorId);
        if (!indicadorDb) continue;

        let competencia: Date;
        try {
          competencia = normalizarCompetencia(resultado.competencia);
        } catch {
          continue;
        }

        await prisma.construtorIndicadorSugestao.create({
          data: {
            execucaoId: execucao.id,
            indicadorId: indicadorDb.id,
            competencia,
            valorSugerido: resultado.valor,
            documentoNomeOrigem: documento.nomeArquivo,
            paginaOrigem: resultado.pagina,
            trechoOrigem: resultado.trecho,
          },
        });
      }
    }

    await prisma.documentoUpload.updateMany({
      where: { id: { in: input.documentoUploadIds } },
      data: { construtorExecucaoId: execucao.id },
    });

    return construtorRepository.getExecucao(input.tenantId, execucao.id);
  },

  async listExecucoes(tenantId: string) {
    return prisma.tenantConstrutorExecucao.findMany({
      where: { tenantId },
      orderBy: { geradoEm: "desc" },
      include: {
        tipoDocumento: { select: { nome: true, referenciaTipo: true } },
        documentos: { select: { id: true, nomeArquivo: true } },
        indicadorSugestoes: { include: { indicador: { select: { id: true, nome: true, tipo: true, unidade: true } } } },
      },
    });
  },

  async getExecucao(tenantId: string, id: string) {
    const execucao = await prisma.tenantConstrutorExecucao.findUnique({
      where: { id },
      include: {
        tipoDocumento: { select: { nome: true, referenciaTipo: true } },
        documentos: { select: { id: true, nomeArquivo: true } },
        indicadorSugestoes: { include: { indicador: { select: { id: true, nome: true, tipo: true, unidade: true } } } },
      },
    });
    if (!execucao || execucao.tenantId !== tenantId) throw new HttpError(404, "Execução não encontrada.");
    return execucao;
  },

  async aprovarExecucao(tenantId: string, id: string, userId: string) {
    const execucao = await prisma.tenantConstrutorExecucao.findUnique({ where: { id } });
    if (!execucao || execucao.tenantId !== tenantId) throw new HttpError(404, "Execução não encontrada.");
    if (execucao.status === "APROVADO") throw new HttpError(400, "Esta execução já foi aprovada.");

    await prisma.tenantConstrutorExecucao.update({
      where: { id },
      data: { status: "APROVADO", aprovadoEm: new Date(), aprovadoPorUserId: userId },
    });
    return construtorRepository.getExecucao(tenantId, id);
  },
};
