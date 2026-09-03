import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../../middleware/auth";
import { crpRepository } from "./crp.repository";
import { HttpError } from "../../middleware/errorHandler";
import { z } from "zod";

export const crpRouter = Router();

crpRouter.use(requireAuth);

crpRouter.get("/", async (req: AuthenticatedRequest, res, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const criteria = await crpRepository.listForTenant(tenantId);
    res.json({ criteria });
  } catch (err) {
    next(err);
  }
});

crpRouter.get("/summary", async (req: AuthenticatedRequest, res, next) => {
  try {
    const summary = await crpRepository.summary(req.auth!.tenantId);
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

const updateSchema = z.object({
  status: z.enum(["REGULAR", "IRREGULAR", "PENDENTE"]).optional(),
  lastSentAt: z.string().datetime().nullable().optional(),
  nextDueAt: z.string().datetime().nullable().optional(),
  responsibleUserId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

crpRouter.patch("/:criterionId", async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, "Payload inválido.");
    }

    const { criterionId } = req.params;
    const { lastSentAt, nextDueAt, ...rest } = parsed.data;

    const updated = await crpRepository.updateStatus(req.auth!.tenantId, criterionId, {
      ...rest,
      lastSentAt: lastSentAt === undefined ? undefined : lastSentAt === null ? null : new Date(lastSentAt),
      nextDueAt: nextDueAt === undefined ? undefined : nextDueAt === null ? null : new Date(nextDueAt),
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});
