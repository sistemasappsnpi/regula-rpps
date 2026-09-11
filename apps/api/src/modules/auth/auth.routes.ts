import { Router } from "express";
import { z } from "zod";
import { authService } from "./auth.service";
import { HttpError } from "../../middleware/errorHandler";
import { requireAuth, type AuthenticatedRequest } from "../../middleware/auth";
import { listEnabledFeaturesForUser, listEnabledAdminFeaturesForUser } from "../../middleware/features";
import { prisma } from "../../db/prisma";
import { isMicrosoftSsoConfigured, isGovbrSsoConfigured } from "../../config/env";

export const authRouter = Router();

// Pública — o frontend consulta antes de decidir quais botões de SSO desenhar (nunca um botão
// morto pra um provedor sem credencial configurada, ver LoginPage.tsx).
authRouter.get("/providers", (_req, res) => {
  res.json({ microsoft: isMicrosoftSsoConfigured(), govbr: isGovbrSsoConfigured() });
});

// Funciona tanto para usuário de tenant quanto para o Super Admin da plataforma (tenant null
// nesse caso) — é o que o frontend usa para saber, após o refresh da página, para qual área
// (dashboard do tenant ou admin global) redirecionar a sessão.
authRouter.get("/me", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
    if (!user) throw new HttpError(404, "Usuário não encontrado.");

    const tenant = req.auth!.tenantId ? await prisma.tenant.findUnique({ where: { id: req.auth!.tenantId } }) : null;
    const features = tenant
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

const registerSchema = z.object({
  tenantName: z.string().min(3),
  federatedEntity: z.string().min(2),
  seguradosCount: z.number().int().nonnegative().default(0),
  adminName: z.string().min(2),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8),
});

authRouter.post("/register-tenant", async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0]?.message ?? "Payload inválido.");
    }
    const result = await authService.registerTenant(parsed.data);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, "Informe e-mail e senha.");
    }
    const result = await authService.login(parsed.data.email, parsed.data.password);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

// Autotroca de senha do próprio usuário logado (tenant ou Super Admin) — exige a senha atual,
// diferente do link de primeiro acesso (ver primeiro-acesso.routes.ts), que não tem senha prévia.
authRouter.post("/change-password", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0]?.message ?? "Payload inválido.");
    }
    await authService.changePassword(req.auth!.userId, parsed.data.currentPassword, parsed.data.newPassword);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
