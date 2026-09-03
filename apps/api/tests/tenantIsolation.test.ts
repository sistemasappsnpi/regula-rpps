import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakePrisma } from "./fakePrisma";

vi.mock("../src/db/prisma", () => ({ prisma: createFakePrisma() }));

// Importado depois do mock para garantir que crpRepository use a instância fake.
const { crpRepository } = await import("../src/modules/crp/crp.repository");
const { prisma } = (await import("../src/db/prisma")) as any;

const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";

describe("crpRepository — isolamento multi-tenant (MySQL não tem RLS nativo)", () => {
  beforeEach(() => {
    prisma.__reset();
    prisma.__seedTenantRow({
      id: "row-a1",
      tenantId: TENANT_A,
      criterionId: "crit-1",
      status: "REGULAR",
      lastSentAt: null,
      nextDueAt: null,
      responsibleUserId: null,
      notes: "Evidência do tenant A",
    });
    prisma.__seedTenantRow({
      id: "row-b1",
      tenantId: TENANT_B,
      criterionId: "crit-1",
      status: "IRREGULAR",
      lastSentAt: null,
      nextDueAt: null,
      responsibleUserId: null,
      notes: "Evidência do tenant B — nunca deve aparecer para o tenant A",
    });
    prisma.__seedTenantRow({
      id: "row-b2",
      tenantId: TENANT_B,
      criterionId: "crit-2",
      status: "IRREGULAR",
      lastSentAt: null,
      nextDueAt: null,
      responsibleUserId: null,
      notes: "Só existe para o tenant B",
    });
  });

  it("listForTenant só retorna o status do próprio tenant, mesmo quando o critério é compartilhado", async () => {
    const criteria = await crpRepository.listForTenant(TENANT_A);
    const shared = criteria.find((c: any) => c.id === "crit-1");

    expect(shared.tenantStatuses).toHaveLength(1);
    expect(shared.tenantStatuses[0].tenantId).toBe(TENANT_A);
    expect(shared.tenantStatuses[0].notes).toBe("Evidência do tenant A");
  });

  it("summary não soma linhas de outro tenant", async () => {
    const summaryA = await crpRepository.summary(TENANT_A);
    const summaryB = await crpRepository.summary(TENANT_B);

    expect(summaryA.regular).toBe(1);
    expect(summaryA.irregular).toBe(0);
    expect(summaryB.irregular).toBe(2);
    expect(summaryB.regular).toBe(0);
  });

  it("updateStatus não permite que o tenant A altere um registro que só existe para o tenant B", async () => {
    // Simula um atacante autenticado como tenant A tentando adivinhar o criterionId
    // de um registro que só o tenant B possui (crit-2).
    await expect(crpRepository.updateStatus(TENANT_A, "crit-2", { status: "REGULAR" })).rejects.toThrow();

    // O dado do tenant B precisa permanecer intacto.
    const summaryB = await crpRepository.summary(TENANT_B);
    expect(summaryB.irregular).toBe(2);
  });

  it("updateStatus funciona normalmente quando o tenantId corresponde ao dono do registro", async () => {
    const updated = await crpRepository.updateStatus(TENANT_A, "crit-1", { status: "IRREGULAR" });
    expect(updated.status).toBe("IRREGULAR");

    const summaryB = await crpRepository.summary(TENANT_B);
    expect(summaryB.irregular).toBe(2); // inalterado
  });
});
