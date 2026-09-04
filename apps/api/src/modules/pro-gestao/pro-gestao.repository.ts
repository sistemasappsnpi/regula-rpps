import type { FieldOrigin, NivelAderencia } from "@prisma/client";
import { prisma } from "../../db/prisma";

export const NIVEL_ORDER: NivelAderencia[] = ["I", "II", "III", "IV"];
export function nivelIndex(n: NivelAderencia): number {
  return NIVEL_ORDER.indexOf(n);
}
export function nivelAlcanca(campoNivel: NivelAderencia, nivelSelecionado: NivelAderencia): boolean {
  return nivelIndex(campoNivel) <= nivelIndex(nivelSelecionado);
}

/**
 * Todo método aqui recebe tenantId explicitamente e o usa em toda cláusula WHERE de
 * tabela `tenant_*` — mesmo padrão de isolamento do módulo CRP (ver crp.repository.ts).
 */
export const proGestaoRepository = {
  async listAcoes() {
    return prisma.proGestaoAcao.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        campos: { orderBy: { sortOrder: "asc" } },
        dependeDe: { include: { fonte: true } },
      },
    });
  },

  async getAcao(acaoCodigo: string) {
    return prisma.proGestaoAcao.findUnique({
      where: { codigo: acaoCodigo },
      include: {
        campos: { orderBy: { sortOrder: "asc" } },
        dependeDe: { include: { fonte: { include: { campos: true } } } },
      },
    });
  },

  async tenantAcaoStatuses(tenantId: string) {
    return prisma.tenantProGestaoAcao.findMany({ where: { tenantId } });
  },

  async tenantAcaoStatus(tenantId: string, acaoCodigo: string) {
    return prisma.tenantProGestaoAcao.findUnique({ where: { tenantId_acaoCodigo: { tenantId, acaoCodigo } } });
  },

  async setNivelAtual(tenantId: string, acaoCodigo: string, nivel: NivelAderencia | null) {
    return prisma.tenantProGestaoAcao.upsert({
      where: { tenantId_acaoCodigo: { tenantId, acaoCodigo } },
      update: { nivelAtual: nivel },
      create: { tenantId, acaoCodigo, nivelAtual: nivel },
    });
  },

  /** Valor vigente de cada campo = a linha mais recente (nunca sobrescrevemos, ver schema.prisma). */
  async currentValues(tenantId: string, campoDbIds: string[]) {
    if (campoDbIds.length === 0) return [];
    const rows = await prisma.tenantProGestaoCampoValor.findMany({
      where: { tenantId, campoId: { in: campoDbIds } },
      orderBy: { createdAt: "desc" },
      include: { criadoPor: { select: { id: true, name: true } } },
    });
    const seen = new Set<string>();
    const current = [];
    for (const row of rows) {
      if (seen.has(row.campoId)) continue;
      seen.add(row.campoId);
      current.push(row);
    }
    return current;
  },

  async history(tenantId: string, campoDbId: string) {
    return prisma.tenantProGestaoCampoValor.findMany({
      where: { tenantId, campoId: campoDbId },
      orderBy: { createdAt: "desc" },
      include: { criadoPor: { select: { id: true, name: true } } },
    });
  },

  async setCampoValor(input: {
    tenantId: string;
    campoDbId: string;
    valor: string;
    origem: FieldOrigin;
    origemDetalhe?: string | null;
    userId: string;
  }) {
    return prisma.tenantProGestaoCampoValor.create({
      data: {
        tenantId: input.tenantId,
        campoId: input.campoDbId,
        valor: input.valor,
        origem: input.origem,
        origemDetalhe: input.origemDetalhe ?? null,
        criadoPorUserId: input.userId,
      },
    });
  },

  async findCampoByCampoId(acaoCodigo: string, campoId: string) {
    return prisma.proGestaoCampo.findUnique({ where: { acaoCodigo_campoId: { acaoCodigo, campoId } } });
  },

  async getDocumentoComposto(tenantId: string, acaoCodigo: string) {
    return prisma.tenantDocumentoComposto.findUnique({ where: { tenantId_acaoCodigo: { tenantId, acaoCodigo } } });
  },

  async upsertDocumentoComposto(input: {
    tenantId: string;
    acaoCodigo: string;
    conteudo: string;
    baseadoEmValorIds: string;
  }) {
    return prisma.tenantDocumentoComposto.upsert({
      where: { tenantId_acaoCodigo: { tenantId: input.tenantId, acaoCodigo: input.acaoCodigo } },
      update: {
        conteudo: input.conteudo,
        baseadoEmValorIds: input.baseadoEmValorIds,
        status: "RASCUNHO",
        geradoEm: new Date(),
        aprovadoEm: null,
        aprovadoPorUserId: null,
      },
      create: {
        tenantId: input.tenantId,
        acaoCodigo: input.acaoCodigo,
        conteudo: input.conteudo,
        baseadoEmValorIds: input.baseadoEmValorIds,
      },
    });
  },

  async aprovarDocumentoComposto(tenantId: string, acaoCodigo: string, userId: string) {
    return prisma.tenantDocumentoComposto.update({
      where: { tenantId_acaoCodigo: { tenantId, acaoCodigo } },
      data: { status: "APROVADO", aprovadoEm: new Date(), aprovadoPorUserId: userId },
    });
  },

  /**
   * Se um documento composto aprovado foi gerado citando uma versão de campo que acabou de
   * ser substituída por uma nova, marca-o DESATUALIZADO (nunca silenciosamente reescreve o
   * rascunho já aprovado). Ver /docs/modelo-de-dados.md, seção 2, tipo 3.
   */
  async marcarCompostosDesatualizadosPorCampo(tenantId: string, campoDbId: string, novoValorId: string) {
    const compostos = await prisma.tenantDocumentoComposto.findMany({
      where: { tenantId, status: "APROVADO" },
    });

    for (const composto of compostos) {
      const baseIds = JSON.parse(composto.baseadoEmValorIds) as { campoDbId: string; valorId: string }[];
      const usaEsteCampoComVersaoAntiga = baseIds.some(
        (b) => b.campoDbId === campoDbId && b.valorId !== novoValorId,
      );
      if (usaEsteCampoComVersaoAntiga) {
        await prisma.tenantDocumentoComposto.update({
          where: { id: composto.id },
          data: { status: "DESATUALIZADO" },
        });
      }
    }
  },

  async listAuditoria(tenantId: string) {
    const [campoValores, uploads, compostos] = await Promise.all([
      prisma.tenantProGestaoCampoValor.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        include: { criadoPor: { select: { name: true, email: true } }, campo: { include: { acao: true } } },
      }),
      prisma.documentoUpload.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        include: { uploadedBy: { select: { name: true, email: true } } },
      }),
      prisma.tenantDocumentoComposto.findMany({ where: { tenantId }, orderBy: { geradoEm: "desc" } }),
    ]);

    return { campoValores, uploads, compostos };
  },
};
