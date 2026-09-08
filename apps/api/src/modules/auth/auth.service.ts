import type { Membership, Tenant, User } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { hashPassword, comparePassword } from "../../utils/password";
import { signAuthToken } from "../../utils/jwt";
import { HttpError } from "../../middleware/errorHandler";
import { crpRepository } from "../crp/crp.repository";
import { slugify } from "../../utils/slugify";
import { listEnabledFeaturesForUser, listEnabledAdminFeaturesForUser } from "../../middleware/features";

/**
 * Emite o JWT pra um usuário já resolvido (achado por senha local ou por SSO — ver
 * microsoft-sso.routes.ts/govbr-sso.routes.ts) — mesma regra em todo lugar: Super Admin nunca
 * carrega tenantId, usuário de tenant precisa de ao menos um Membership (MVP: usa o primeiro).
 */
export function issueTokenForUser(user: Pick<User, "id" | "isSuperAdmin">, memberships: (Membership & { tenant: Tenant })[]): string {
  if (user.isSuperAdmin) {
    return signAuthToken({ userId: user.id, tenantId: null, isSuperAdmin: true });
  }
  if (memberships.length === 0) {
    throw new HttpError(401, "Este usuário não está vinculado a nenhum RPPS.");
  }
  return signAuthToken({ userId: user.id, tenantId: memberships[0].tenantId, isSuperAdmin: false });
}

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
    const token = signAuthToken({
      userId: membership.userId,
      tenantId: tenant.id,
      isSuperAdmin: false,
    });
    const features = await listEnabledFeaturesForUser(membership.userId, tenant.id, tenant.plan);

    return { token, tenant, user: membership.user, isSuperAdmin: false, features };
  },

  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { memberships: { include: { tenant: true } } },
    });

    if (!user) {
      throw new HttpError(401, "E-mail ou senha inválidos.");
    }

    const passwordMatches = await comparePassword(password, user.passwordHash);
    if (!passwordMatches) {
      throw new HttpError(401, "E-mail ou senha inválidos.");
    }

    if (!user.ativo) {
      throw new HttpError(401, "Usuário inativo. Fale com o administrador do seu RPPS.");
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    // Super Admin da plataforma: nunca vinculado a um tenant específico (ver schema.prisma).
    if (user.isSuperAdmin) {
      const token = signAuthToken({ userId: user.id, tenantId: null, isSuperAdmin: true });
      return {
        token,
        tenant: null,
        user: { id: user.id, name: user.name, email: user.email },
        isSuperAdmin: true,
        features: await listEnabledAdminFeaturesForUser(user.id),
      };
    }

    if (user.memberships.length === 0) {
      throw new HttpError(401, "E-mail ou senha inválidos.");
    }

    // MVP: usuário de tenant vinculado a um único tenant. Suporte a múltiplos tenants por
    // usuário (troca de contexto) fica para uma iteração futura (ver ROADMAP #7).
    const membership = user.memberships[0];
    const token = signAuthToken({
      userId: user.id,
      tenantId: membership.tenantId,
      isSuperAdmin: false,
    });
    const features = await listEnabledFeaturesForUser(user.id, membership.tenantId, membership.tenant.plan);

    return {
      token,
      tenant: membership.tenant,
      user: { id: user.id, name: user.name, email: user.email },
      isSuperAdmin: false,
      features,
    };
  },
};
