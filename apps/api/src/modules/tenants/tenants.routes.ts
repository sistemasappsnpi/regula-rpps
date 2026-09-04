import { Router } from "express";
import { requireAuth, requireTenant, type AuthenticatedRequest } from "../../middleware/auth";
import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";

export const tenantsRouter = Router();

tenantsRouter.use(requireAuth, requireTenant);

tenantsRouter.get("/me", async (req: AuthenticatedRequest, res, next) => {
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: req.auth!.tenantId! } });
    if (!tenant) {
      throw new HttpError(404, "Tenant não encontrado.");
    }
    res.json(tenant);
  } catch (err) {
    next(err);
  }
});
