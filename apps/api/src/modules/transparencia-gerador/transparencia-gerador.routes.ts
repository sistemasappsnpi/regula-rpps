import { Router } from "express";
import multer from "multer";
import { HttpError } from "../../middleware/errorHandler";
import {
  LIMITE_IMAGEM, calcularSugestoes, carregarCliente, excluirCliente, gerarCliente, iconesDoModelo,
  importarPortal, listarClientes, montarZip, slug, testarMenu, testarTransparencia, type ArquivoEnviado,
} from "./gerador.service";

// Gerador de Portal da Transparência. Montado em /admin/transparencia-gerador (ver admin.routes.ts,
// que já exige Super Admin + a permissão admin_parametrizacoes).
export const transparenciaGeradorRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: LIMITE_IMAGEM, files: 2 } });

const q = (v: unknown) => (typeof v === "string" ? v : "");

transparenciaGeradorRouter.get("/clientes", async (_req, res, next) => {
  try {
    res.json(await listarClientes());
  } catch (err) {
    next(err);
  }
});

transparenciaGeradorRouter.get("/clientes/:pasta", async (req, res, next) => {
  try {
    const cliente = await carregarCliente(req.params.pasta);
    if (!cliente) throw new HttpError(404, "Cliente não encontrado.");
    res.json(cliente);
  } catch (err) {
    next(err);
  }
});

transparenciaGeradorRouter.delete("/clientes/:pasta", async (req, res, next) => {
  try {
    if (!(await excluirCliente(req.params.pasta))) throw new HttpError(404, "Cliente não encontrado.");
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

transparenciaGeradorRouter.get("/clientes/:pasta/zip", async (req, res, next) => {
  try {
    const zip = await montarZip(req.params.pasta);
    if (!zip) throw new HttpError(404, "Cliente não encontrado.");
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="portal-${slug(req.params.pasta)}.zip"`);
    res.setHeader("Content-Length", String(zip.length));
    res.end(zip);
  } catch (err) {
    next(err);
  }
});

transparenciaGeradorRouter.get("/testar", async (req, res, next) => {
  try {
    const d = q(req.query.d);
    if (d === "transparencia") return void res.json(await testarTransparencia(q(req.query.url)));
    if (d === "menu") return void res.json(await testarMenu(q(req.query.url)));
    throw new HttpError(400, "Tipo inválido.");
  } catch (err) {
    next(err);
  }
});

transparenciaGeradorRouter.get("/sugestoes", async (req, res, next) => {
  try {
    res.json(await calcularSugestoes(q(req.query.url), q(req.query.pasta)));
  } catch (err) {
    next(err);
  }
});

transparenciaGeradorRouter.get("/icones", (_req, res, next) => {
  try {
    res.json(iconesDoModelo());
  } catch (err) {
    next(err);
  }
});

// Importa um portal existente do gerador antigo (pasta clientes/<nome>): config.json + logo + dados/cache_*.
const uploadImportacao = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024, files: 6 } });
transparenciaGeradorRouter.post(
  "/importar",
  (req, res, next) =>
    uploadImportacao.fields([
      { name: "config", maxCount: 1 }, { name: "logo", maxCount: 1 }, { name: "icone", maxCount: 1 },
      { name: "cacheTransparencia", maxCount: 1 }, { name: "cacheMenu", maxCount: 1 }, { name: "cacheOrdem", maxCount: 1 },
    ])(req, res, (err) => next(err instanceof multer.MulterError ? new HttpError(400, "Falha no envio dos arquivos.") : err)),
  async (req, res, next) => {
    try {
      const files = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
      const arq = (campo: string) => files[campo]?.[0];
      const texto = (campo: string) => arq(campo)?.buffer.toString("utf8");
      const configTxt = texto("config");
      if (!configTxt) throw new HttpError(400, "Envie o config.json do portal.");
      let config: Record<string, unknown>;
      try {
        config = JSON.parse(configTxt.replace(/^﻿/, ""));
      } catch {
        throw new HttpError(400, "config.json não é um JSON válido.");
      }
      const imagem = (campo: string): ArquivoEnviado | undefined => {
        const f = arq(campo);
        return f ? { buffer: f.buffer, nome: f.originalname } : undefined;
      };
      res.json({
        ok: true,
        ...(await importarPortal({
          pasta: q(req.body?.pasta), config, logo: imagem("logo"), icone: imagem("icone"),
          cacheTransparencia: texto("cacheTransparencia"), cacheMenu: texto("cacheMenu"), cacheOrdem: texto("cacheOrdem"),
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

transparenciaGeradorRouter.post(
  "/gerar",
  (req, res, next) =>
    upload.fields([{ name: "logo", maxCount: 1 }, { name: "icone", maxCount: 1 }])(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return next(new HttpError(400, err.code === "LIMIT_FILE_SIZE" ? "A imagem passa de 3 MB." : "Falha no envio da imagem."));
      }
      next(err);
    }),
  async (req, res) => {
    // O front espera { ok:false, erro } nas falhas de validação (como o gerador original).
    try {
      let entrada: unknown;
      try {
        entrada = JSON.parse(q(req.body?.dados));
      } catch {
        throw new HttpError(400, "Dados inválidos.");
      }
      if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) throw new HttpError(400, "Dados inválidos.");

      const files = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
      const pegar = (campo: string): ArquivoEnviado | undefined => {
        const f = files[campo]?.[0];
        return f ? { buffer: f.buffer, nome: f.originalname } : undefined;
      };
      const r = await gerarCliente(entrada as Record<string, unknown>, { logo: pegar("logo"), icone: pegar("icone") });
      res.json({ ok: true, ...r });
    } catch (err) {
      if (err instanceof HttpError) return void res.status(err.status).json({ ok: false, erro: err.message });
      console.error(err);
      res.status(500).json({ ok: false, erro: "Erro interno ao gerar o portal." });
    }
  },
);
