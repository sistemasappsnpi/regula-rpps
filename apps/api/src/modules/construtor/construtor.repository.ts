import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";
import {
  montarDocumentoConstrutor,
  extrairIndicadoresAutonomamente,
  isAiConfigured,
  type DocumentoFonteConstrutor,
  type IndicadorChecklist,
} from "../ai/anthropic.client";
import { normalizarCompetencia } from "../portal-indicadores/portal-indicadores.service";
import { slugify } from "../../utils/slugify";

// A IA nomeia indicadores livremente (não existe catálogo pré-definido pra ela seguir) — pequenas
// variações de pontuação entre execuções (ex.: "Rentabilidade X 2026" numa rodada, "Rentabilidade
// X - 2026" noutra) não podem virar dois indicadores diferentes no catálogo. Ignora tudo que não
// for letra/número na comparação, mantendo o nome original (da primeira vez que apareceu) exibido.
function chaveIndicador(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

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
      include: { indicadores: { include: { subcampos: true } } },
    });
    if (!portalDocumento) throw new HttpError(404, "Documento do Portal Previdenciário não encontrado.");

    // Indicadores já criados nesta execução, pra não criar duplicata quando o mesmo nome
    // aparece em mais de um PDF-fonte ou mais de uma vez no resultado da IA (só usado pra
    // descoberta livre — em CHECKLIST_APENAS nunca entra aqui).
    const indicadoresPorNome = new Map(portalDocumento.indicadores.map((i) => [chaveIndicador(i.nome), i]));
    const checklistPorId = new Map(portalDocumento.indicadores.map((i) => [i.id, i]));

    // Fora do modo COMENTARIO_APENAS, todo indicador já cadastrado no catálogo deste documento
    // (ver checklist de campos em Parametrizações) vira um alvo obrigatório de extração — a IA
    // precisa tentar todos e sinalizar `encontrado=false` pros que não achar.
    const checklist: IndicadorChecklist[] =
      docPersonalizado.modoExtracaoIA === "COMENTARIO_APENAS"
        ? []
        : portalDocumento.indicadores.map((i) => ({
            indicadorId: i.id,
            nome: i.nome,
            tipo: i.tipo,
            unidade: i.unidade,
            subcampos: i.subcampos.map((s) => ({ subcampoId: s.id, nome: s.nome, tipo: s.tipo, unidade: s.unidade })),
          }));
    const checklistEscalarIds = new Set(checklist.filter((c) => c.subcampos.length === 0).map((c) => c.indicadorId));

    // Sugestões ficam só em memória enquanto a IA ainda está processando (pode levar bastante
    // tempo em documentos grandes) — só viram linha no banco (e só aparecem no Histórico) depois
    // que TUDO terminar com sucesso, dentro da mesma transação que cria a execução. Antes disso a
    // execução em si nem existia ainda, então não tinha como o usuário excluí-la no meio do
    // processamento e derrubar a extração com uma violação de chave estrangeira — e se a extração
    // falhar em qualquer ponto, nada é gravado (nenhuma execução malsucedida "vaza" pro Histórico).
    const sugestoesData: {
      indicadorId: string;
      uploadId: string;
      competencia: Date;
      encontrado: boolean;
      valorSugerido: string;
      documentoNomeOrigem: string;
      paginaOrigem: number | null;
      trechoOrigem: string | null;
    }[] = [];

    for (const documento of documentos) {
      const paginas = JSON.parse(documento.paginasTexto) as { pagina: number; texto: string }[];
      const { resultados, resultadosGrupo } = await extrairIndicadoresAutonomamente(
        documento.nomeArquivo,
        tipo.promptInstrucoes,
        paginas,
        docPersonalizado.modoExtracaoIA,
        checklist,
      );

      // Competência-âncora deste documento: um retrato-pontual usa a MESMA competência em tudo
      // (ver PROMPT_COMPETENCIA), então serve de fallback pros campos do checklist que a IA
      // marcou como não encontrados e por isso não trouxeram competência própria.
      const competenciaAncoraStr =
        resultados.find((r) => r.encontrado && r.competencia)?.competencia ??
        resultadosGrupo.find((r) => r.competencia)?.competencia ??
        null;

      const vistosNoChecklist = new Set<string>();

      for (const resultado of resultados) {
        if (resultado.indicadorChecklistId) vistosNoChecklist.add(resultado.indicadorChecklistId);
        if (!resultado.indicadorChecklistId && (!resultado.encontrado || !resultado.valor || !resultado.nome.trim())) continue;

        const competenciaStr = resultado.competencia ?? (resultado.encontrado ? null : competenciaAncoraStr);
        if (!competenciaStr) continue;
        let competencia: Date;
        try {
          competencia = normalizarCompetencia(competenciaStr);
        } catch {
          continue;
        }

        let indicadorDb = resultado.indicadorChecklistId ? checklistPorId.get(resultado.indicadorChecklistId) : undefined;
        if (!indicadorDb) {
          // Descoberta livre (nunca acontece em CHECKLIST_APENAS, checklist=[] nesse caso).
          const chave = chaveIndicador(resultado.nome);
          indicadorDb = indicadoresPorNome.get(chave);
          if (!indicadorDb) {
            const usados = new Set(portalDocumento.indicadores.map((i) => i.indicadorId));
            const base = slugify(resultado.nome) || `indicador-${indicadoresPorNome.size + 1}`;
            let indicadorId = base;
            let n = 1;
            while (usados.has(indicadorId)) indicadorId = `${base}-${++n}`;
            usados.add(indicadorId);

            const novo = await prisma.portalIndicador.create({
              data: {
                documentoId: portalDocumento.id,
                indicadorId,
                nome: resultado.nome.trim(),
                tipo: resultado.tipo,
                unidade: resultado.unidade,
                sortOrder: portalDocumento.indicadores.length + indicadoresPorNome.size,
              },
              include: { subcampos: true },
            });
            indicadoresPorNome.set(chave, novo);
            portalDocumento.indicadores.push(novo);
            indicadorDb = novo;
          }
        }

        sugestoesData.push({
          indicadorId: indicadorDb.id,
          uploadId: documento.id,
          competencia,
          encontrado: resultado.encontrado,
          valorSugerido: resultado.valor ?? "",
          documentoNomeOrigem: documento.nomeArquivo,
          paginaOrigem: resultado.pagina,
          trechoOrigem: resultado.trecho,
        });
      }

      // Ocorrências de campos com subcampos (ex.: um membro de comitê por ocorrência) — uma
      // sugestão por ocorrência, valorSugerido guarda um JSON {subcampoId: valor}.
      for (const ocorrencia of resultadosGrupo) {
        const indicadorDb = checklistPorId.get(ocorrencia.indicadorChecklistId);
        if (!indicadorDb || ocorrencia.subcampos.length === 0) continue;
        vistosNoChecklist.add(ocorrencia.indicadorChecklistId);

        const competenciaStr = ocorrencia.competencia ?? competenciaAncoraStr;
        if (!competenciaStr) continue;
        let competencia: Date;
        try {
          competencia = normalizarCompetencia(competenciaStr);
        } catch {
          continue;
        }

        sugestoesData.push({
          indicadorId: indicadorDb.id,
          uploadId: documento.id,
          competencia,
          encontrado: true,
          valorSugerido: JSON.stringify(Object.fromEntries(ocorrencia.subcampos.map((s) => [s.subcampoId, s.valor]))),
          documentoNomeOrigem: documento.nomeArquivo,
          paginaOrigem: ocorrencia.pagina,
          trechoOrigem: ocorrencia.trecho,
        });
      }

      // Rede de segurança: campo escalar do checklist que a IA simplesmente não mencionou em
      // nenhum resultado (nem achado, nem encontrado=false) — cria a sugestão vazia mesmo assim,
      // sempre que houver competência-âncora pra ancorar nela.
      if (competenciaAncoraStr) {
        for (const indicadorId of checklistEscalarIds) {
          if (vistosNoChecklist.has(indicadorId)) continue;
          const indicadorDb = checklistPorId.get(indicadorId);
          if (!indicadorDb) continue;
          let competencia: Date;
          try {
            competencia = normalizarCompetencia(competenciaAncoraStr);
          } catch {
            continue;
          }
          sugestoesData.push({
            indicadorId: indicadorDb.id,
            uploadId: documento.id,
            competencia,
            encontrado: false,
            valorSugerido: "",
            documentoNomeOrigem: documento.nomeArquivo,
            paginaOrigem: null,
            trechoOrigem: null,
          });
        }
      }
    }

    const execucao = await prisma.$transaction(async (tx) => {
      const criada = await tx.tenantConstrutorExecucao.create({
        data: {
          tenantId: input.tenantId,
          tipoDocumentoId: tipo.id,
          conteudo: "",
          citacoes: "[]",
          geradoPorUserId: input.userId,
        },
      });
      if (sugestoesData.length > 0) {
        await tx.construtorIndicadorSugestao.createMany({
          data: sugestoesData.map((s) => ({ ...s, execucaoId: criada.id })),
        });
      }
      await tx.documentoUpload.updateMany({
        where: { id: { in: input.documentoUploadIds } },
        data: { construtorExecucaoId: criada.id },
      });
      return criada;
    });

    return construtorRepository.getExecucao(input.tenantId, execucao.id);
  },

  async listExecucoes(tenantId: string) {
    return prisma.tenantConstrutorExecucao.findMany({
      where: { tenantId },
      orderBy: { geradoEm: "desc" },
      include: {
        tipoDocumento: { select: { id: true, nome: true, referenciaTipo: true } },
        documentos: { select: { id: true, nomeArquivo: true } },
        indicadorSugestoes: {
          include: {
            indicador: {
              select: { id: true, nome: true, tipo: true, unidade: true, subcampos: { orderBy: { sortOrder: "asc" } } },
            },
          },
        },
      },
    });
  },

  async getExecucao(tenantId: string, id: string) {
    const execucao = await prisma.tenantConstrutorExecucao.findUnique({
      where: { id },
      include: {
        tipoDocumento: { select: { id: true, nome: true, referenciaTipo: true } },
        documentos: { select: { id: true, nomeArquivo: true } },
        indicadorSugestoes: {
          include: {
            indicador: {
              select: { id: true, nome: true, tipo: true, unidade: true, subcampos: { orderBy: { sortOrder: "asc" } } },
            },
          },
        },
      },
    });
    if (!execucao || execucao.tenantId !== tenantId) throw new HttpError(404, "Execução não encontrada.");
    return execucao;
  },

  /**
   * Exclui uma execução E desfaz tudo que ela publicou no Portal Previdenciário (valores
   * escalares e ocorrências de grupo) — escopado só aos uploads DESTA execução
   * (TenantPortalIndicadorValor/Instancia guardam documentoUploadId), nunca a outros lançamentos
   * do mesmo indicador/competência vindos de outra execução ou lançamento manual. Existe porque
   * uma extração que deu errado no meio (ex.: resposta da IA truncada por checklist grande — ver
   * max_tokens em extrairIndicadoresAutonomamente) podia ter sido aprovada em lote mesmo assim,
   * deixando um lançamento incompleto público — sem isto, excluir a execução só limpava o
   * Histórico, o dado errado continuava visível pro cidadão.
   */
  async excluirExecucao(tenantId: string, id: string) {
    const execucao = await prisma.tenantConstrutorExecucao.findUnique({ where: { id } });
    if (!execucao || execucao.tenantId !== tenantId) throw new HttpError(404, "Execução não encontrada.");

    await prisma.$transaction([
      prisma.tenantPortalIndicadorValor.deleteMany({
        where: { tenantId, documentoUpload: { construtorExecucaoId: id } },
      }),
      prisma.tenantPortalIndicadorInstancia.deleteMany({
        where: { tenantId, documentoUpload: { construtorExecucaoId: id } },
      }),
      prisma.tenantConstrutorExecucao.delete({ where: { id } }),
    ]);
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

  // Cria uma sugestão em branco (PENDENTE, encontrado=false) pro humano preencher na revisão —
  // usado pra adicionar manualmente uma ocorrência que a IA não achou num indicador com
  // subcampos (ver botão "Adicionar ocorrência" no Construtor).
  async criarSugestaoVazia(tenantId: string, execucaoId: string, indicadorId: string, competencia: Date) {
    const execucao = await prisma.tenantConstrutorExecucao.findUnique({ where: { id: execucaoId } });
    if (!execucao || execucao.tenantId !== tenantId) throw new HttpError(404, "Execução não encontrada.");
    const indicador = await prisma.portalIndicador.findUnique({ where: { id: indicadorId } });
    if (!indicador) throw new HttpError(404, "Indicador não encontrado.");

    return prisma.construtorIndicadorSugestao.create({
      data: {
        execucaoId,
        indicadorId,
        competencia,
        encontrado: false,
        valorSugerido: "",
        documentoNomeOrigem: "Adicionado manualmente",
        status: "PENDENTE",
      },
      include: { indicador: { include: { subcampos: true } } },
    });
  },
};
