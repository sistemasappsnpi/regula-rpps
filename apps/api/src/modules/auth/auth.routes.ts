import { Router } from "express";
import { z } from "zod";
import { authService } from "./auth.service";
import { HttpError } from "../../middleware/errorHandler";

export const authRouter = Router();

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
