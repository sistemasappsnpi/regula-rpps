import { prisma } from "../../db/prisma";
import { hashPassword, comparePassword } from "../../utils/password";
import { signAuthToken } from "../../utils/jwt";
import { HttpError } from "../../middleware/errorHandler";
import { crpRepository } from "../crp/crp.repository";
import { slugify } from "../../utils/slugify";

export interface RegisterTenantInput {
  tenantName: string;
  federatedEntity: string;
  seguradosCount: number;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
}

export const authService = {
  async registerTenant(input: RegisterTenantInput) {
    const existing = await prisma.user.findUnique({ where: { email: input.adminEmail } });
    if (existing) {
      throw new HttpError(409, "Já existe um usuário com este e-mail.");
    }

    const baseSlug = slugify(input.tenantName);
    let slug = baseSlug;
    let attempt = 1;
    while (await prisma.tenant.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${++attempt}`;
    }

    const passwordHash = await hashPassword(input.adminPassword);

    const tenant = await prisma.tenant.create({
      data: {
        name: input.tenantName,
        slug,
        federatedEntity: input.federatedEntity,
        seguradosCount: input.seguradosCount,
        memberships: {
          create: {
            role: "RPPS_ADMIN",
            user: {
              create: {
                name: input.adminName,
                email: input.adminEmail,
                passwordHash,
              },
            },
          },
        },
      },
      include: { memberships: { include: { user: true } } },
    });

    await crpRepository.ensureTenantRows(tenant.id);

    const membership = tenant.memberships[0];
    const token = signAuthToken({ userId: membership.userId, tenantId: tenant.id, role: membership.role });

    return { token, tenant, user: membership.user };
  },

  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { memberships: { include: { tenant: true } } },
    });

    if (!user || user.memberships.length === 0) {
      throw new HttpError(401, "E-mail ou senha inválidos.");
    }

    const passwordMatches = await comparePassword(password, user.passwordHash);
    if (!passwordMatches) {
      throw new HttpError(401, "E-mail ou senha inválidos.");
    }

    // MVP: usuário vinculado a um único tenant. Suporte a múltiplos tenants por
    // usuário (troca de contexto) fica para uma iteração futura (ver ROADMAP #7).
    const membership = user.memberships[0];
    const token = signAuthToken({ userId: user.id, tenantId: membership.tenantId, role: membership.role });

    return { token, tenant: membership.tenant, user: { id: user.id, name: user.name, email: user.email } };
  },
};
