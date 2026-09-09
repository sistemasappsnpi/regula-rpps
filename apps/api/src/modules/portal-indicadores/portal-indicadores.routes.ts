import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireTenant, type AuthenticatedRequest } from "../../middleware/auth";
import { requireFeature } from "../../middleware/features";
import { HttpError } from "../../middleware/errorHandler";
import { portalIndicadoresRepository } from "./portal-indicadores.repository";
import { normalizarCompetencia, registrarValorDeIndicador } from "./portal-indicadores.service";

// Lançamento manual de valores do catálogo do Portal Previdenciário (ver PortalDocumento/
// PortalIndicador, cadastrados pelo Admin Global). Via alternativa ao Construtor de Documentos
// (extração por PDF, ver /construtor) para quando o RPPS não tem um PDF pra enviar. Exclusivo do
// plano que inclui "portal_previdenciario_indicadores".
export const portalIndicadoresRouter = Router();
portalIndicadoresRouter.use(requireAuth, requireTenant, requireFeature("portal_previdenciario_indicadores"));

portalIndicadoresRouter.get("/", async (req: AuthenticatedRequest, res, next) => {
  try {
    const tenantId = req.auth!.tenantId!;
    const documentos = await portalIndicadoresRepository.listCatalogoAtivo();
    const todosIndicadorIds = documentos.flatMap((d) => d.indicadores.map((i) => i.id));
    const valoresAtuais = await portalIndicadoresRepository.currentValuesPorCompetencia(tenantId, todosIndicadorIds);

    const documentosComValores = documentos.map((doc) => ({
      ...doc,
      indicadores: doc.indicadores.map((indicador) => ({
        ...indicador,
        valoresAtuais: valoresAtuais.filter((v) => v.indicadorId === indicador.id),
      })),
    }));

    res.json({ documentos: documentosComValores });
  } catch (err) {
    next(err);
  }
});

portalIndicadoresRouter.get("/:indicadorId/historico", async (req: AuthenticatedRequest, res, next) => {
  try {
    const historico = await portalIndicadoresRepository.history(req.auth!.tenantId!, req.params.indicadorId);
    res.json({ historico });
  } catch (err) {
    next(err);
  }
});

const valorSchema = z.object({
  competencia: z.string().min(1, "Informe a competência."),
  valor: z.string().min(1, "Valor não pode ser vazio."),
});

portalIndicadoresRouter.put("/:indicadorId/valor", async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = valorSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Payload inválido.");

    const created = await registrarValorDeIndicador({
      tenantId: req.auth!.tenantId!,
      indicadorDbId: req.params.indicadorId,
      competencia: normalizarCompetencia(parsed.data.competencia),
      valor: parsed.data.valor,
      origem: "MANUAL",
      userId: req.auth!.userId,
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});
