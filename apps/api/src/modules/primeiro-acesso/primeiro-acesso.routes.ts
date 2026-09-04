import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { hashPassword } from "../../utils/password";
import { HttpError } from "../../middleware/errorHandler";

// Rota pública (sem requireAuth): o link de primeiro acesso é distribuído pelo admin do RPPS
// para toda a equipe de uma vez (ver adminRepository.getOrCreateFirstAccessLink) — cada pessoa
// se identifica pelo próprio e-mail, já pré-cadastrado como membership deste tenant, e define
// telefone + senha para destravar o próprio login. Nunca cria um vínculo novo por aqui.
export const primeiroAcessoPublicRouter = Router();

primeiroAcessoPublicRouter.get("/:token", async (req, res, next) => {
  try {
    const tenant = await prisma.tenant.findUnique({ where: { firstAccessToken: req.params.token } });
    if (!tenant) throw new HttpError(404, "Link de primeiro acesso inválido ou expirado.");
    res.json({ tenantName: tenant.name });
  } catch (err) {
    next(err);
  }
});

const completarSchema = z.object({
  email: z.string().email(),
  telefone: z.string().min(8),
  password: z.string().min(8),
});

primeiroAcessoPublicRouter.post("/:token", async (req, res, next) => {
  try {
    const parsed = completarSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Payload inválido.");

    const tenant = await prisma.tenant.findUnique({ where: { firstAccessToken: req.params.token } });
    if (!tenant) throw new HttpError(404, "Link de primeiro acesso inválido ou expirado.");

    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      include: { memberships: { where: { tenantId: tenant.id } } },
    });
    if (!user || user.memberships.length === 0) {
      throw new HttpError(404, "Não encontramos este e-mail cadastrado para este RPPS. Confira com o administrador.");
    }

    const passwordHash = await hashPassword(parsed.data.password);
    await prisma.user.update({
      where: { id: user.id },
      data: { telefone: parsed.data.telefone, passwordHash },
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
