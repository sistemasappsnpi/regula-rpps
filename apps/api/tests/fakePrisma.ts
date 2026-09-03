/**
 * Prisma Client falso, em memória, usado apenas em testes — não há MySQL disponível
 * neste ambiente de desenvolvimento. Implementa apenas o subconjunto de operações
 * usado pelos repositórios, o suficiente para provar as regras de isolamento por tenant.
 */

interface CrpCriterionRow {
  id: string;
  code: string;
  sortOrder: number;
}

interface TenantCrpCriterionRow {
  id: string;
  tenantId: string;
  criterionId: string;
  status: "REGULAR" | "IRREGULAR" | "PENDENTE";
  lastSentAt: Date | null;
  nextDueAt: Date | null;
  responsibleUserId: string | null;
  notes: string | null;
}

export function createFakePrisma() {
  const crpCriteria: CrpCriterionRow[] = [
    { id: "crit-1", code: "CRP-01", sortOrder: 1 },
    { id: "crit-2", code: "CRP-02", sortOrder: 2 },
  ];

  const tenantRows: TenantCrpCriterionRow[] = [];
  let idCounter = 0;

  function findRow(tenantId: string, criterionId: string) {
    return tenantRows.find((r) => r.tenantId === tenantId && r.criterionId === criterionId);
  }

  return {
    crpCriterion: {
      findMany: async ({ orderBy, select, include }: any = {}) => {
        const rows = [...crpCriteria].sort((a, b) => (orderBy ? a.sortOrder - b.sortOrder : 0));
        if (select?.id) return rows.map((r) => ({ id: r.id }));

        const tenantIdFilter = include?.tenantStatuses?.where?.tenantId;
        if (tenantIdFilter !== undefined) {
          return rows.map((r) => ({
            ...r,
            tenantStatuses: tenantRows.filter((t) => t.criterionId === r.id && t.tenantId === tenantIdFilter),
          }));
        }
        return rows;
      },
    },
    tenantCrpCriterion: {
      upsert: async ({ where, create }: any) => {
        const existing = findRow(where.tenantId_criterionId.tenantId, where.tenantId_criterionId.criterionId);
        if (existing) return existing;
        const row: TenantCrpCriterionRow = {
          id: `row-${++idCounter}`,
          tenantId: create.tenantId,
          criterionId: create.criterionId,
          status: create.status ?? "PENDENTE",
          lastSentAt: create.lastSentAt ?? null,
          nextDueAt: create.nextDueAt ?? null,
          responsibleUserId: create.responsibleUserId ?? null,
          notes: create.notes ?? null,
        };
        tenantRows.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = findRow(where.tenantId_criterionId.tenantId, where.tenantId_criterionId.criterionId);
        if (!row) {
          throw new Error("Record to update not found.");
        }
        Object.assign(row, data);
        return row;
      },
      findMany: async ({ where }: any) => tenantRows.filter((r) => r.tenantId === where.tenantId),
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
    __seedTenantRow: (row: TenantCrpCriterionRow) => {
      tenantRows.push(row);
    },
    __reset: () => {
      tenantRows.length = 0;
    },
  };
}

export type FakePrisma = ReturnType<typeof createFakePrisma>;
