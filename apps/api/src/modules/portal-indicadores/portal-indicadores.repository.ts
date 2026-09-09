import type { FieldOrigin } from "@prisma/client";
import { prisma } from "../../db/prisma";

/**
 * Todo método aqui recebe tenantId explicitamente e o usa em toda cláusula WHERE de tabela
 * `tenant_*` — mesmo padrão de isolamento do módulo Pró-Gestão (ver pro-gestao.repository.ts).
 * Diferença em relação ao Pró-Gestão: o "vigente" aqui é por par (indicadorId, competência), não
 * só por indicadorId — um mesmo indicador tem um valor por mês/ano, não um valor único.
 */
export const portalIndicadoresRepository = {
  async listCatalogoAtivo() {
    return prisma.portalDocumento.findMany({
      where: { ativo: true },
      orderBy: { sortOrder: "asc" },
      include: { indicadores: { orderBy: { sortOrder: "asc" } } },
    });
  },

  async findIndicadorById(indicadorDbId: string) {
    return prisma.portalIndicador.findUnique({ where: { id: indicadorDbId } });
  },

  /** Valor vigente de cada (indicadorId, competência) = a linha mais recente (nunca sobrescrevemos). */
  async currentValuesPorCompetencia(tenantId: string, indicadorDbIds: string[]) {
    if (indicadorDbIds.length === 0) return [];
    const rows = await prisma.tenantPortalIndicadorValor.findMany({
      where: { tenantId, indicadorId: { in: indicadorDbIds } },
      orderBy: { createdAt: "desc" },
      include: { criadoPor: { select: { id: true, name: true } } },
    });
    const seen = new Set<string>();
    const current = [];
    for (const row of rows) {
      const key = `${row.indicadorId}|${row.competencia.toISOString()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      current.push(row);
    }
    return current;
  },

  async history(tenantId: string, indicadorDbId: string) {
    return prisma.tenantPortalIndicadorValor.findMany({
      where: { tenantId, indicadorId: indicadorDbId },
      orderBy: { createdAt: "desc" },
      include: { criadoPor: { select: { id: true, name: true } } },
    });
  },

  async setIndicadorValor(input: {
    tenantId: string;
    indicadorDbId: string;
    competencia: Date;
    valor: string;
    origem: FieldOrigin;
    origemDetalhe?: string | null;
    userId: string;
  }) {
    return prisma.tenantPortalIndicadorValor.create({
      data: {
        tenantId: input.tenantId,
        indicadorId: input.indicadorDbId,
        competencia: input.competencia,
        valor: input.valor,
        origem: input.origem,
        origemDetalhe: input.origemDetalhe ?? null,
        criadoPorUserId: input.userId,
      },
    });
  },
};
