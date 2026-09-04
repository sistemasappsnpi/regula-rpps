import type { NextFunction, Response } from "express";
import type { Plan } from "@prisma/client";
import { prisma } from "../db/prisma";
import type { AuthenticatedRequest } from "./auth";

/**
 * "Permissionar todo o sistema de acordo com o que cada um contratar" — mas o plano nunca é um
 * teto rígido: resolução em três camadas (Feature / PlanFeature / TenantFeature / UserFeature,
 * configuráveis pelo Admin Global em /admin/parametrizacoes, em Admin → RPPS clientes → editar
 * → Permissões, e em Admin → Usuários → Permissões):
 *   1) PlanFeature — padrão do plano contratado.
 *   2) TenantFeature — override deste RPPS específico, vence o padrão do plano.
 *   3) UserFeature — override deste usuário específico, vence tudo acima (pro caso de uma
 *      pessoa da equipe precisar de acesso diferente do resto do RPPS).
 * Nenhuma regra de "este plano/este RPPS/este usuário libera aquele módulo" fica hardcoded em
 * código de rota — as rotas só perguntam "esta feature está ligada para este usuário?".
 */
export async function isFeatureEnabledForPlan(plan: Plan, featureKey: string): Promise<boolean> {
  const row = await prisma.planFeature.findUnique({ where: { plan_featureKey: { plan, featureKey } } });
  return row?.enabled ?? false;
}

export async function isFeatureEnabledForTenant(tenantId: string, featureKey: string): Promise<boolean> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } });
  if (!tenant) return false;

  const override = await prisma.tenantFeature.findUnique({
    where: { tenantId_featureKey: { tenantId, featureKey } },
  });
  if (override) return override.enabled;

  return isFeatureEnabledForPlan(tenant.plan, featureKey);
}

/** Camada final: aplica o override do usuário por cima do que valeria para ele via tenant/plano. */
export async function isFeatureEnabledForUser(userId: string, tenantId: string, featureKey: string): Promise<boolean> {
  const override = await prisma.userFeature.findUnique({ where: { userId_featureKey: { userId, featureKey } } });
  if (override) return override.enabled;

  return isFeatureEnabledForTenant(tenantId, featureKey);
}

/** Igual a listEnabledFeaturesForTenant, mas já aplicando os overrides deste usuário específico. */
export async function listEnabledFeaturesForUser(userId: string, tenantId: string, plan: Plan): Promise<string[]> {
  const [planFeatures, tenantOverrides, userOverrides] = await Promise.all([
    prisma.planFeature.findMany({ where: { plan } }),
    prisma.tenantFeature.findMany({ where: { tenantId } }),
    prisma.userFeature.findMany({ where: { userId } }),
  ]);

  const resultado = new Set<string>();
  const tenantByKey = new Map(tenantOverrides.map((o) => [o.featureKey, o.enabled]));

  for (const pf of planFeatures) {
    const viaPlanoOuTenant = tenantByKey.has(pf.featureKey) ? tenantByKey.get(pf.featureKey)! : pf.enabled;
    if (viaPlanoOuTenant) resultado.add(pf.featureKey);
  }
  // Idem: um override pode ligar/desligar uma chave que nem apareceu no plano — defensivo.
  for (const o of tenantOverrides) {
    if (o.enabled) resultado.add(o.featureKey);
    else resultado.delete(o.featureKey);
  }
  for (const o of userOverrides) {
    if (o.enabled) resultado.add(o.featureKey);
    else resultado.delete(o.featureKey);
  }

  return Array.from(resultado);
}

/** Usar após requireAuth + requireTenant. Bloqueia com 403 se o usuário não tiver a feature. */
export function requireFeature(featureKey: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const tenantId = req.auth?.tenantId;
    if (!tenantId) {
      res.status(403).json({ error: "Esta rota exige um usuário vinculado a um RPPS (tenant)." });
      return;
    }

    const enabled = await isFeatureEnabledForUser(req.auth!.userId, tenantId, featureKey);
    if (!enabled) {
      res.status(403).json({
        error: "Este recurso não está disponível para o seu usuário neste RPPS.",
        featureKey,
      });
      return;
    }
    next();
  };
}

// ---------------------------------------------------------------------------------------
// Features ADMIN — seções do painel Admin Global (RPPS clientes, Usuários, Parametrizações).
// Não têm plano nem tenant por trás: só o override por usuário (UserFeature). Sem override,
// o padrão é "liberado" — um Super Admin enxerga tudo, a menos que alguém restrinja
// explicitamente aquela conta em Admin → Usuários → Permissões.
// ---------------------------------------------------------------------------------------

export async function isAdminFeatureEnabledForUser(userId: string, featureKey: string): Promise<boolean> {
  const override = await prisma.userFeature.findUnique({ where: { userId_featureKey: { userId, featureKey } } });
  return override ? override.enabled : true;
}

export async function listEnabledAdminFeaturesForUser(userId: string): Promise<string[]> {
  const [features, overrides] = await Promise.all([
    prisma.feature.findMany({ where: { escopo: "ADMIN" }, select: { key: true } }),
    prisma.userFeature.findMany({ where: { userId } }),
  ]);

  const overrideByKey = new Map(overrides.map((o) => [o.featureKey, o.enabled]));
  return features.map((f) => f.key).filter((key) => overrideByKey.get(key) ?? true);
}

/** Usar após requireAuth + requireSuperAdmin, por prefixo de rota (ver admin.routes.ts). */
export function requireAdminFeature(featureKey: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const enabled = await isAdminFeatureEnabledForUser(req.auth!.userId, featureKey);
    if (!enabled) {
      res.status(403).json({ error: "Esta seção do Admin Global não está liberada para o seu usuário.", featureKey });
      return;
    }
    next();
  };
}
