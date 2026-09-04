import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";

/**
 * Documentos Personalizados: tipos de documento fora do catálogo oficial do Pró-Gestão/CRP,
 * criados do zero pelo Super Admin (ver admin.repository.ts). O preenchimento e a publicação
 * são exclusivos do tenant — mesmo motor do resto do sistema: campo opcional, valor vigente é
 * sempre a linha mais recente (nunca sobrescreve, ver TenantDocumentoPersonalizadoValor).
 */
export const documentosPersonalizadosRepository = {
  async listParaTenant(tenantId: string) {
    const documentos = await prisma.documentoPersonalizado.findMany({
      where: { ativo: true },
      orderBy: { sortOrder: "asc" },
      include: {
        campos: { orderBy: { sortOrder: "asc" } },
        publicacoes: { where: { tenantId } },
      },
    });

    const campoIds = documentos.flatMap((d) => d.campos.map((c) => c.id));
    const valores = campoIds.length
      ? await prisma.tenantDocumentoPersonalizadoValor.findMany({
          where: { tenantId, campoId: { in: campoIds } },
          orderBy: { createdAt: "desc" },
        })
      : [];

    const valorVigentePorCampo = new Map<string, string>();
    for (const v of valores) {
      if (!valorVigentePorCampo.has(v.campoId)) valorVigentePorCampo.set(v.campoId, v.valor);
    }

    return documentos.map((d) => ({
      id: d.id,
      codigo: d.codigo,
      nome: d.nome,
      descricao: d.descricao,
      publicacao: d.publicacoes[0] ?? null,
      campos: d.campos.map((c) => ({
        id: c.id,
        campoId: c.campoId,
        descricao: c.descricao,
        obrigatorio: c.obrigatorio,
        valorAtual: valorVigentePorCampo.get(c.id) ?? null,
      })),
    }));
  },

  async setCampoValor(input: { tenantId: string; campoDbId: string; valor: string; userId: string }) {
    const campo = await prisma.documentoPersonalizadoCampo.findUnique({ where: { id: input.campoDbId } });
    if (!campo) throw new HttpError(404, "Campo não encontrado.");

    return prisma.tenantDocumentoPersonalizadoValor.create({
      data: { tenantId: input.tenantId, campoId: input.campoDbId, valor: input.valor, criadoPorUserId: input.userId },
    });
  },

  /**
   * Publica direto (sem rascunho intermediário — diferente do documento composto do
   * Pró-Gestão): o próprio ato de "Publicar" já é a decisão humana explícita de tornar público
   * o que está preenchido agora. Sobrescreve a publicação anterior deste tenant+documento.
   */
  async publicar(tenantId: string, documentoId: string, userId: string) {
    const documento = await prisma.documentoPersonalizado.findUnique({
      where: { id: documentoId },
      include: { campos: { orderBy: { sortOrder: "asc" } } },
    });
    if (!documento || !documento.ativo) throw new HttpError(404, "Documento personalizado não encontrado.");

    const campoIds = documento.campos.map((c) => c.id);
    const valores = campoIds.length
      ? await prisma.tenantDocumentoPersonalizadoValor.findMany({
          where: { tenantId, campoId: { in: campoIds } },
          orderBy: { createdAt: "desc" },
        })
      : [];

    const valorVigentePorCampo = new Map<string, string>();
    for (const v of valores) {
      if (!valorVigentePorCampo.has(v.campoId)) valorVigentePorCampo.set(v.campoId, v.valor);
    }

    const conteudo = documento.campos
      .filter((c) => valorVigentePorCampo.has(c.id))
      .map((c) => ({ campoId: c.campoId, descricao: c.descricao, valor: valorVigentePorCampo.get(c.id)! }));

    if (conteudo.length === 0) {
      throw new HttpError(400, "Preencha ao menos um campo antes de publicar.");
    }

    const agora = new Date();
    return prisma.tenantDocumentoPersonalizadoPublicacao.upsert({
      where: { tenantId_documentoId: { tenantId, documentoId } },
      update: {
        conteudo: JSON.stringify(conteudo),
        status: "APROVADO",
        geradoEm: agora,
        aprovadoEm: agora,
        aprovadoPorUserId: userId,
      },
      create: {
        tenantId,
        documentoId,
        conteudo: JSON.stringify(conteudo),
        status: "APROVADO",
        aprovadoEm: agora,
        aprovadoPorUserId: userId,
      },
    });
  },
};
