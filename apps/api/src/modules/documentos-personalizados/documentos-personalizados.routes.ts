import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireTenant, type AuthenticatedRequest } from "../../middleware/auth";
import { requireFeature } from "../../middleware/features";
import { HttpError } from "../../middleware/errorHandler";
import { documentosPersonalizadosRepository } from "./documentos-personalizados.repository";

// Aba "Documentos" do tenant, seção "Personalizados" — tipos de documento fora do catálogo
// oficial, criados pelo Super Admin (ver /admin/documentos-personalizados).
export const documentosPersonalizadosRouter = Router();
documentosPersonalizadosRouter.use(requireAuth, requireTenant, requireFeature("documentos_personalizados"));

documentosPersonalizadosRouter.get("/", async (req: AuthenticatedRequest, res, next) => {
  try {
    res.json({ documentos: await documentosPersonalizadosRepository.listParaTenant(req.auth!.tenantId!) });
  } catch (err) {
    next(err);
  }
});

const valorSchema = z.object({ valor: z.string() });

documentosPersonalizadosRouter.put("/campos/:campoDbId/valor", async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = valorSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "Payload inválido.");
    const valor = await documentosPersonalizadosRepository.setCampoValor({
      tenantId: req.auth!.tenantId!,
      campoDbId: req.params.campoDbId,
      valor: parsed.data.valor,
      userId: req.auth!.userId,
    });
    res.json(valor);
  } catch (err) {
    next(err);
  }
});

documentosPersonalizadosRouter.post("/:documentoId/publicar", async (req: AuthenticatedRequest, res, next) => {
  try {
    const publicacao = await documentosPersonalizadosRepository.publicar(
      req.auth!.tenantId!,
      req.params.documentoId,
      req.auth!.userId,
    );
    res.json(publicacao);
  } catch (err) {
    next(err);
  }
});
