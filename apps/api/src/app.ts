import express from "express";
import cors from "cors";
import { authRouter } from "./modules/auth/auth.routes";
import { tenantsRouter } from "./modules/tenants/tenants.routes";
import { crpRouter } from "./modules/crp/crp.routes";
import { proGestaoRouter } from "./modules/pro-gestao/pro-gestao.routes";
import { uploadsRouter } from "./modules/uploads/uploads.routes";
import { construtorRouter } from "./modules/construtor/construtor.routes";
import { documentosPersonalizadosRouter } from "./modules/documentos-personalizados/documentos-personalizados.routes";
import { documentosPersonalizadosPublicoRouter } from "./modules/documentos-personalizados/documentos-personalizados-publico.routes";
import { transparenciaPublicRouter } from "./modules/transparencia/transparencia.routes";
import { primeiroAcessoPublicRouter } from "./modules/primeiro-acesso/primeiro-acesso.routes";
import { adminRouter } from "./modules/admin/admin.routes";
import { errorHandler } from "./middleware/errorHandler";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/auth", authRouter);
  app.use("/tenants", tenantsRouter);
  app.use("/crp", crpRouter);
  app.use("/pro-gestao", proGestaoRouter);
  app.use("/uploads", uploadsRouter);
  app.use("/construtor", construtorRouter);
  app.use("/documentos-personalizados", documentosPersonalizadosRouter);
  app.use("/public/transparencia", transparenciaPublicRouter);
  app.use("/public/primeiro-acesso", primeiroAcessoPublicRouter);
  app.use("/public/documentos-personalizados", documentosPersonalizadosPublicoRouter);
  app.use("/admin", adminRouter);

  app.use(errorHandler);

  return app;
}
