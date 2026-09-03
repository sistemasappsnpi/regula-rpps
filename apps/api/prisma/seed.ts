import { PrismaClient } from "@prisma/client";
import { CRP_CRITERIA } from "../src/modules/crp/crp.catalog";
import { hashPassword } from "../src/utils/password";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding catálogo oficial de critérios do CRP...");
  for (const criterion of CRP_CRITERIA) {
    await prisma.crpCriterion.upsert({
      where: { code: criterion.code },
      update: criterion,
      create: criterion,
    });
  }

  console.log("Seeding tenant de demonstração...");
  const passwordHash = await hashPassword("demo1234");

  const tenant = await prisma.tenant.upsert({
    where: { slug: "prefeitura-de-vale-verde" },
    update: {},
    create: {
      name: "Prefeitura de Vale Verde — RPPS",
      slug: "prefeitura-de-vale-verde",
      federatedEntity: "Município de Vale Verde - UF",
      plan: "GESTAO",
      seguradosCount: 1800,
      memberships: {
        create: {
          role: "RPPS_ADMIN",
          user: {
            connectOrCreate: {
              where: { email: "admin@valeverde.rpps.gov.br" },
              create: {
                name: "Ana Beatriz Souza",
                email: "admin@valeverde.rpps.gov.br",
                passwordHash,
              },
            },
          },
        },
      },
    },
  });

  const allCriteria = await prisma.crpCriterion.findMany();
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  for (const [index, criterion] of allCriteria.entries()) {
    // A maioria regular, alguns pendentes/vencendo, para demonstrar os estados visuais.
    const isPending = index % 8 === 0;
    const isIrregular = index % 11 === 0;
    const status = isIrregular ? "IRREGULAR" : isPending ? "PENDENTE" : "REGULAR";

    await prisma.tenantCrpCriterion.upsert({
      where: { tenantId_criterionId: { tenantId: tenant.id, criterionId: criterion.id } },
      update: {},
      create: {
        tenantId: tenant.id,
        criterionId: criterion.id,
        status,
        lastSentAt: status === "PENDENTE" ? null : new Date(now - 20 * day),
        nextDueAt: new Date(now + ((index % 6) + 1) * day * 10),
      },
    });
  }

  console.log("Seed concluído. Login de demonstração: admin@valeverde.rpps.gov.br / demo1234");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
