import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";
import {
  montarDocumentoConstrutor,
  extrairIndicadoresAutonomamente,
  isAiConfigured,
  type DocumentoFonteConstrutor,
} from "../ai/anthropic.client";
import { normalizarCompetencia } from "../portal-indicadores/portal-indicadores.service";
import { slugify } from "../../utils/slugify";

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
   * Único caminho hoje pro tenant selecionar algo no Construtor: os tipos PERSONALIZADO, um por
   * DocumentoPersonalizado (ver syncConstrutorTipoParaPersonalizado, admin.repository.ts). Tipos
   * PRO_GESTAO/CRP/LIVRE/PORTAL_PREVIDENCIARIO de sessões anteriores continuam no banco, mas
   * não aparecem mais pro tenant — enxugado a pedido do usuário pra simplificar o fluxo.
   */
  async listTiposAtivos(_tenantId: string, _userId: string) {
    const tipos = await prisma.construtorTipoDocumento.findMany({
      where: { ativo: true, referenciaTipo: "PERSONALIZADO" },
      orderBy: { sortOrder: "asc" },
    });

    return tipos.map((t) => ({
      id: t.id,
      nome: t.nome,
      referenciaTipo: t.referenciaTipo,
      referenciaNome: null as string | null,
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

    if (tipo.referenciaTipo === "PERSONALIZADO") {
      return construtorRepository.gerarExecucaoIndicadoresAutonomos(input, tipo, documentos);
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
   * Caminho de geração para tipos PERSONALIZADO: em vez de montar um texto único citando fontes,
   * a IA decide sozinha quais indicadores extrair de cada PDF-fonte (ver
   * extrairIndicadoresAutonomamente) — sem catálogo pré-cadastrado — e cria uma
   * ConstrutorIndicadorSugestao por resultado encontrado, pra revisão humana item a item (mesmo
   * requisito de "nunca aprovar tudo em lote" do resto do sistema, ver uploads.routes.ts).
   * conteudo/citacoes ficam vazios — o conteúdo de verdade desta execução mora nas sugestões.
   */
  async gerarExecucaoIndicadoresAutonomos(
    input: { tenantId: string; userId: string; tipoDocumentoId: string; documentoUploadIds: string[] },
    tipo: { id: string; documentoPersonalizadoId: string | null; promptInstrucoes: string },
    documentos: { id: string; nomeArquivo: string; paginasTexto: string }[],
  ) {
    if (!tipo.documentoPersonalizadoId) {
      throw new HttpError(404, "Este tipo de documento não está ligado a nenhum documento personalizado.");
    }

    const docPersonalizado = await prisma.documentoPersonalizado.findUnique({
      where: { id: tipo.documentoPersonalizadoId },
    });
    if (!docPersonalizado || !docPersonalizado.portalDocumentoId) {
      throw new HttpError(404, "Este documento ainda não tem um espelho do Portal Previdenciário configurado.");
    }

    const portalDocumento = await prisma.portalDocumento.findUnique({
      where: { id: docPersonalizado.portalDocumentoId },
      include: { indicadores: true },
    });
    if (!portalDocumento) throw new HttpError(404, "Documento do Portal Previdenciário não encontrado.");

    const execucao = await prisma.tenantConstrutorExecucao.create({
      data: {
        tenantId: input.tenantId,
        tipoDocumentoId: tipo.id,
        conteudo: "",
        citacoes: "[]",
        geradoPorUserId: input.userId,
      },
    });

    // Indicadores já criados nesta execução, pra não criar duplicata quando o mesmo nome
    // aparece em mais de um PDF-fonte ou mais de uma vez no resultado da IA.
    const indicadoresPorNome = new Map(portalDocumento.indicadores.map((i) => [i.nome.trim().toLowerCase(), i]));

    for (const documento of documentos) {
      const paginas = JSON.parse(documento.paginasTexto) as { pagina: number; texto: string }[];
      const resultados = await extrairIndicadoresAutonomamente(documento.nomeArquivo, tipo.promptInstrucoes, paginas);

      for (const resultado of resultados) {
        if (!resultado.valor || !resultado.competencia || !resultado.nome.trim()) continue;

        let competencia: Date;
        try {
          competencia = normalizarCompetencia(resultado.competencia);
        } catch {
          continue;
        }

        const chave = resultado.nome.trim().toLowerCase();
        let indicadorDb = indicadoresPorNome.get(chave);
        if (!indicadorDb) {
          const usados = new Set(portalDocumento.indicadores.map((i) => i.indicadorId));
          const base = slugify(resultado.nome) || `indicador-${indicadoresPorNome.size + 1}`;
          let indicadorId = base;
          let n = 1;
          while (usados.has(indicadorId)) indicadorId = `${base}-${++n}`;
          usados.add(indicadorId);

          indicadorDb = await prisma.portalIndicador.create({
            data: {
              documentoId: portalDocumento.id,
              indicadorId,
              nome: resultado.nome.trim(),
              tipo: resultado.tipo,
              unidade: resultado.unidade,
              sortOrder: portalDocumento.indicadores.length + indicadoresPorNome.size,
            },
          });
          indicadoresPorNome.set(chave, indicadorDb);
          portalDocumento.indicadores.push(indicadorDb);
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
