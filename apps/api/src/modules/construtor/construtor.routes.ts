import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireTenant, type AuthenticatedRequest } from "../../middleware/auth";
import { requireFeature } from "../../middleware/features";
import { HttpError } from "../../middleware/errorHandler";
import { construtorRepository } from "./construtor.repository";

// Construtor de Documentos: o usuário escolhe um tipo de documento (configurado pelo Admin
// Global) e quantos documentos-fonte já enviados quiser (ver /uploads/construtor) e pede pra IA
// montar o documento final. Exclusivo do plano que inclui "construtor_documentos".
export const construtorRouter = Router();

// `citacoes` é guardado como JSON bruto no banco (TenantConstrutorExecucao.citacoes); a rota
// é quem decide o formato exposto ao cliente, mesmo padrão de getDocumentoComposto no módulo
// Pró-Gestão (ver pro-gestao.routes.ts).
function serializarExecucao<T extends { citacoes: string }>(execucao: T) {
  return { ...execucao, citacoes: JSON.parse(execucao.citacoes) };
}
construtorRouter.use(requireAuth, requireTenant, requireFeature("construtor_documentos"));

construtorRouter.get("/tipos", async (req: AuthenticatedRequest, res, next) => {
  try {
    res.json({ tipos: await construtorRepository.listTiposAtivos(req.auth!.tenantId!) });
  } catch (err) {
    next(err);
  }
});

const gerarSchema = z.object({
  tipoDocumentoId: z.string().min(1),
  documentoUploadIds: z.array(z.string().min(1)).min(1),
});

construtorRouter.post("/gerar", async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = gerarSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Payload inválido.");

    const execucao = await construtorRepository.gerarExecucao({
      tenantId: req.auth!.tenantId!,
      userId: req.auth!.userId,
      tipoDocumentoId: parsed.data.tipoDocumentoId,
      documentoUploadIds: parsed.data.documentoUploadIds,
    });
    res.status(201).json(serializarExecucao(execucao));
  } catch (err) {
    next(err);
  }
});

construtorRouter.get("/execucoes", async (req: AuthenticatedRequest, res, next) => {
  try {
    const execucoes = await construtorRepository.listExecucoes(req.auth!.tenantId!);
    res.json({ execucoes: execucoes.map(serializarExecucao) });
  } catch (err) {
    next(err);
  }
});

construtorRouter.get("/execucoes/:id", async (req: AuthenticatedRequest, res, next) => {
  try {
    const execucao = await construtorRepository.getExecucao(req.auth!.tenantId!, req.params.id);
    res.json(serializarExecucao(execucao));
  } catch (err) {
    next(err);
  }
});

construtorRouter.post("/execucoes/:id/aprovar", async (req: AuthenticatedRequest, res, next) => {
  try {
    const execucao = await construtorRepository.aprovarExecucao(req.auth!.tenantId!, req.params.id, req.auth!.userId);
    res.json(serializarExecucao(execucao));
  } catch (err) {
    next(err);
  }
});
