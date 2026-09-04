import type { CriterionStatus } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";

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
    const criteria = await prisma.crpCriterion.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        tenantStatuses: { where: { tenantId } },
        dependsOn: { include: { tenantStatuses: { where: { tenantId } } } },
      },
    });

    // Cascata de regularidade (ver /docs/modelo-de-dados.md, seção 2, tipo 1): um critério
    // nunca pode aparecer como REGULAR se o critério do qual depende não estiver REGULAR,
    // mesmo que o status bruto salvo para ele seja REGULAR (dado desatualizado/inconsistente).
    return criteria.map((criterion) => {
      const own = criterion.tenantStatuses[0];
      const depStatus = criterion.dependsOn?.tenantStatuses[0]?.status;
      const cascadeBlocked = Boolean(criterion.dependsOnCode) && depStatus !== "REGULAR";
      const effectiveStatus: CriterionStatus =
        cascadeBlocked && own?.status === "REGULAR" ? "IRREGULAR" : (own?.status ?? "PENDENTE");

      return { ...criterion, effectiveStatus, cascadeBlocked };
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
    if (input.status === "REGULAR") {
      const criterion = await prisma.crpCriterion.findUnique({
        where: { id: criterionId },
        include: { dependsOn: { include: { tenantStatuses: { where: { tenantId } } } } },
      });

      const depStatus = criterion?.dependsOn?.tenantStatuses[0]?.status;
      if (criterion?.dependsOnCode && depStatus !== "REGULAR") {
        throw new HttpError(
          400,
          `Não é possível marcar como regular: este critério depende de "${criterion.dependsOn?.title}", que ainda não está regular.`,
        );
      }
    }

    return prisma.tenantCrpCriterion.update({
      where: { tenantId_criterionId: { tenantId, criterionId } },
      data: input,
    });
  },

  async summary(tenantId: string) {
    const criteria = await this.listForTenant(tenantId);
    const total = criteria.length;
    const regular = criteria.filter((c) => c.effectiveStatus === "REGULAR").length;
    const irregular = criteria.filter((c) => c.effectiveStatus === "IRREGULAR").length;
    const pendente = criteria.filter((c) => c.effectiveStatus === "PENDENTE").length;

    const rows = await prisma.tenantCrpCriterion.findMany({ where: { tenantId } });
    const nextDue = rows
      .filter((r) => r.nextDueAt && r.nextDueAt.getTime() >= Date.now())
      .sort((a, b) => (a.nextDueAt?.getTime() ?? 0) - (b.nextDueAt?.getTime() ?? 0))[0];

    return { total, regular, irregular, pendente, nextDueAt: nextDue?.nextDueAt ?? null };
  },
};
