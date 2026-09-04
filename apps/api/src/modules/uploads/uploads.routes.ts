import * as fs from "node:fs";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { env } from "../../config/env";
import { requireAuth, requireTenant, type AuthenticatedRequest } from "../../middleware/auth";
import { requireFeature } from "../../middleware/features";
import { HttpError } from "../../middleware/errorHandler";
import { prisma } from "../../db/prisma";
import { registrarValorDeCampo } from "../pro-gestao/pro-gestao.service";
import { processarUploadDeAcao, processarUploadDeConstrutor, processarUploadDeCriterio } from "./uploads.service";

fs.mkdirSync(env.uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: env.uploadsDir,
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      cb(new Error("Apenas arquivos PDF são aceitos."));
      return;
    }
    cb(null, true);
  },
});

export const uploadsRouter = Router();
uploadsRouter.use(requireAuth, requireTenant);

// ---------------------------------------------------------------------------------------
// Pró-Gestão: upload por ação, com extração assistida por IA campo a campo. Exclusivo do
// plano que inclui "pro_gestao_ia_extracao" — ver /middleware/features.ts.
// ---------------------------------------------------------------------------------------

uploadsRouter.post(
  "/acao/:acaoCodigo",
  requireFeature("pro_gestao_ia_extracao"),
  upload.single("file"),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!req.file) throw new HttpError(400, "Nenhum arquivo enviado.");

      const resultado = await processarUploadDeAcao({
        tenantId: req.auth!.tenantId!,
        acaoCodigo: req.params.acaoCodigo,
        userId: req.auth!.userId,
        nomeArquivo: req.file.originalname,
        caminhoArquivo: req.file.path,
        buffer: fs.readFileSync(req.file.path),
      });

      res.status(201).json(resultado);
    } catch (err) {
      next(err);
    }
  },
);

uploadsRouter.get("/acao/:acaoCodigo", requireFeature("pro_gestao_ia_extracao"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const uploads = await prisma.documentoUpload.findMany({
      where: { tenantId: req.auth!.tenantId!, acaoCodigo: req.params.acaoCodigo },
      orderBy: { createdAt: "desc" },
      include: { sugestoes: true },
    });
    res.json({ uploads });
  } catch (err) {
    next(err);
  }
});

// Biblioteca central de documentos do Pró-Gestão (aba "Documentos") — todos os uploads de
// todas as ações do tenant, para a tela que organiza o que compõe a Transparência.
uploadsRouter.get("/acao", requireFeature("pro_gestao_ia_extracao"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const uploads = await prisma.documentoUpload.findMany({
      where: { tenantId: req.auth!.tenantId!, acaoCodigo: { not: null } },
      orderBy: { createdAt: "desc" },
      include: { sugestoes: true },
    });
    res.json({ uploads });
  } catch (err) {
    next(err);
  }
});

const sugestaoSchema = z.object({
  status: z.enum(["APROVADA", "REJEITADA", "CORRIGIDA"]),
  valorFinal: z.string().optional(),
});

// Cada sugestão é aprovada/corrigida/rejeitada individualmente — nunca há um endpoint de
// "aprovar tudo" (requisito explícito do MVP).
uploadsRouter.patch("/sugestoes/:sugestaoId", requireFeature("pro_gestao_ia_extracao"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = sugestaoSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "Payload inválido.");

    const sugestao = await prisma.campoExtraidoSugestao.findUnique({
      where: { id: req.params.sugestaoId },
      include: { upload: true },
    });
    if (!sugestao || sugestao.upload.tenantId !== req.auth!.tenantId!) {
      throw new HttpError(404, "Sugestão não encontrada.");
    }

    const valorFinal = parsed.data.valorFinal ?? sugestao.valorSugerido;

    const atualizada = await prisma.campoExtraidoSugestao.update({
      where: { id: sugestao.id },
      data: { status: parsed.data.status, valorFinal },
    });

    if (parsed.data.status === "APROVADA" || parsed.data.status === "CORRIGIDA") {
      await registrarValorDeCampo({
        tenantId: req.auth!.tenantId!,
        campoDbId: sugestao.campoId,
        valor: valorFinal,
        origem: "PDF_EXTRACTION",
        origemDetalhe: `PDF "${sugestao.upload.nomeArquivo}"${
          sugestao.paginaOrigem ? `, pág. ${sugestao.paginaOrigem}` : ""
        }${sugestao.trechoOrigem ? `: "${sugestao.trechoOrigem}"` : ""}`,
        userId: req.auth!.userId,
      });
    }

    res.json(atualizada);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------------------
// Construtor de Documentos: upload de documento-fonte livre (não pertence a nenhuma ação ou
// critério até ser usado numa geração — ver /construtor).
// ---------------------------------------------------------------------------------------

uploadsRouter.post(
  "/construtor",
  requireFeature("construtor_documentos"),
  upload.single("file"),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!req.file) throw new HttpError(400, "Nenhum arquivo enviado.");

      const documento = await processarUploadDeConstrutor({
        tenantId: req.auth!.tenantId!,
        userId: req.auth!.userId,
        nomeArquivo: req.file.originalname,
        caminhoArquivo: req.file.path,
        buffer: fs.readFileSync(req.file.path),
      });

      res.status(201).json({ documento });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------------------
// CRP: upload de evidência por critério — sem campos estruturados nem IA, é só organização
// da documentação que embasa o critério (a verificação real acontece via GESCON/CADPREV/
// SICONFI). Fluxo independente do Pró-Gestão; disponível em todo plano que tenha CRP.
// ---------------------------------------------------------------------------------------

const criterioUploadSchema = z.object({ descricao: z.string().max(500).optional() });

uploadsRouter.post(
  "/criterio/:criterionCode",
  requireFeature("crp_compliance"),
  upload.single("file"),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!req.file) throw new HttpError(400, "Nenhum arquivo enviado.");
      const parsed = criterioUploadSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, "Payload inválido.");

      const documento = await processarUploadDeCriterio({
        tenantId: req.auth!.tenantId!,
        criterionCode: req.params.criterionCode,
        userId: req.auth!.userId,
        descricao: parsed.data.descricao,
        nomeArquivo: req.file.originalname,
        caminhoArquivo: req.file.path,
        buffer: fs.readFileSync(req.file.path),
      });

      res.status(201).json({ documento });
    } catch (err) {
      next(err);
    }
  },
);

uploadsRouter.get("/criterio/:criterionCode", requireFeature("crp_compliance"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const documentos = await prisma.documentoUpload.findMany({
      where: { tenantId: req.auth!.tenantId!, criterionCode: req.params.criterionCode },
      orderBy: { createdAt: "desc" },
    });
    res.json({ documentos });
  } catch (err) {
    next(err);
  }
});

// Biblioteca central de evidências do CRP — todos os critérios de uma vez ("ver todos os
// documentos"), independente da aba Documentos do Pró-Gestão (fluxo deliberadamente separado).
uploadsRouter.get("/criterio", requireFeature("crp_compliance"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const documentos = await prisma.documentoUpload.findMany({
      where: { tenantId: req.auth!.tenantId!, criterionCode: { not: null } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ documentos });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------------------
// Genérico: remover um documento (de ação ou de critério, tanto faz) — confere posse do
// tenant antes de apagar o arquivo em disco e o registro no banco.
// ---------------------------------------------------------------------------------------

uploadsRouter.delete("/:uploadId", async (req: AuthenticatedRequest, res, next) => {
  try {
    const documento = await prisma.documentoUpload.findUnique({ where: { id: req.params.uploadId } });
    if (!documento || documento.tenantId !== req.auth!.tenantId!) {
      throw new HttpError(404, "Documento não encontrado.");
    }

    await prisma.documentoUpload.delete({ where: { id: documento.id } });
    fs.rm(documento.caminhoArquivo, { force: true }, () => {
      /* melhor esforço: se o arquivo já não existir em disco, ignora */
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
