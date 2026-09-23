import { Router } from "express";
import { HttpError } from "../../middleware/errorHandler";
import { requireAuth, type AuthenticatedRequest } from "../../middleware/auth";
import { listEnabledFeaturesForUser, listEnabledAdminFeaturesForUser } from "../../middleware/features";
import { prisma } from "../../db/prisma";
import { isMicrosoftSsoConfigured, isGovbrSsoConfigured, isCentralSsoConfigured } from "../../config/env";

export const authRouter = Router();

// Pública — o frontend consulta antes de decidir quais botões de SSO desenhar (nunca um botão
// morto pra um provedor sem credencial configurada, ver LoginPage.tsx).
authRouter.get("/providers", (_req, res) => {
  res.json({ central: isCentralSsoConfigured(), microsoft: isMicrosoftSsoConfigured(), govbr: isGovbrSsoConfigured() });
});

// Funciona tanto para usuário de tenant quanto para o Super Admin da plataforma (tenant null
// nesse caso) — é o que o frontend usa para saber, após o refresh da página, para qual área
// (dashboard do tenant ou admin global) redirecionar a sessão.
authRouter.get("/me", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
    if (!user) throw new HttpError(404, "Usuário não encontrado.");

    const tenant = req.auth!.tenantId ? await prisma.tenant.findUnique({ where: { id: req.auth!.tenantId } }) : null;

    // Login "central": a lista de permissões do token já É a lista de features — nunca consulta
    // as tabelas Feature locais. Login "legacy" (Microsoft/gov.br): resolução de sempre via banco.
    const features =
      req.auth!.authSource === "central"
        ? (req.auth!.permissions ?? [])
        : tenant
          ? await listEnabledFeaturesForUser(user.id, tenant.id, tenant.plan)
          : req.auth!.isSuperAdmin
            ? await listEnabledAdminFeaturesForUser(user.id)
            : [];

    res.json({
      user: { id: user.id, name: user.name, email: user.email },
      tenant,
      isSuperAdmin: req.auth!.isSuperAdmin,
      features,
    });
  } catch (err) {
    next(err);
  }
});
