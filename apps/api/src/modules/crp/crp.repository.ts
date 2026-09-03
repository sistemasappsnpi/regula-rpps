import type { CriterionStatus } from "@prisma/client";
import { prisma } from "../../db/prisma";

export interface UpdateCrpStatusInput {
  status?: CriterionStatus;
  lastSentAt?: Date | null;
  nextDueAt?: Date | null;
  responsibleUserId?: string | null;
  notes?: string | null;
}

/**
 * Toda função deste repositório recebe tenantId explicitamente e o usa em
 * toda cláusula WHERE. Nunca criar uma consulta a `tenant_crp_criteria` sem tenantId aqui.
 */
export const crpRepository = {
  async listForTenant(tenantId: string) {
    return prisma.crpCriterion.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        tenantStatuses: {
          where: { tenantId },
        },
      },
    });
  },

  async ensureTenantRows(tenantId: string): Promise<void> {
    const criteria = await prisma.crpCriterion.findMany({ select: { id: true } });
    await prisma.$transaction(
      criteria.map((criterion) =>
        prisma.tenantCrpCriterion.upsert({
          where: { tenantId_criterionId: { tenantId, criterionId: criterion.id } },
          update: {},
          create: { tenantId, criterionId: criterion.id },
        }),
      ),
    );
  },

  async updateStatus(tenantId: string, criterionId: string, input: UpdateCrpStatusInput) {
    return prisma.tenantCrpCriterion.update({
      where: { tenantId_criterionId: { tenantId, criterionId } },
      data: input,
    });
  },

  async summary(tenantId: string) {
    const rows = await prisma.tenantCrpCriterion.findMany({ where: { tenantId } });
    const total = rows.length;
    const regular = rows.filter((r) => r.status === "REGULAR").length;
    const irregular = rows.filter((r) => r.status === "IRREGULAR").length;
    const pendente = rows.filter((r) => r.status === "PENDENTE").length;
    const nextDue = rows
      .filter((r) => r.nextDueAt && r.nextDueAt.getTime() >= Date.now())
      .sort((a, b) => (a.nextDueAt?.getTime() ?? 0) - (b.nextDueAt?.getTime() ?? 0))[0];

    return { total, regular, irregular, pendente, nextDueAt: nextDue?.nextDueAt ?? null };
  },
};
