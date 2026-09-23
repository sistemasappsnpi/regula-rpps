import express from "express";
import cors from "cors";
import { authRouter } from "./modules/auth/auth.routes";
import { centralSsoRouter } from "./modules/auth/central-sso.routes";
import { microsoftSsoRouter } from "./modules/auth/microsoft-sso.routes";
import { govbrSsoRouter } from "./modules/auth/govbr-sso.routes";
import { tenantsRouter } from "./modules/tenants/tenants.routes";
import { crpRouter } from "./modules/crp/crp.routes";
import { proGestaoRouter } from "./modules/pro-gestao/pro-gestao.routes";
import { uploadsRouter } from "./modules/uploads/uploads.routes";
import { construtorRouter } from "./modules/construtor/construtor.routes";
import { portalIndicadoresRouter } from "./modules/portal-indicadores/portal-indicadores.routes";
import { transparenciaPublicRouter } from "./modules/transparencia/transparencia.routes";
import { portalPrevidenciarioPublicRouter } from "./modules/portal-previdenciario/portal-previdenciario.routes";
import { adminRouter } from "./modules/admin/admin.routes";
import { errorHandler } from "./middleware/errorHandler";

export function createApp() {
  const app = express();

  // exposedHeaders: sem isso o navegador não deixa o frontend ler X-Refreshed-Token em respostas
  // cross-origin (ver requireFreshPermissions.ts) — resposta default do pacote cors() não expõe
  // headers customizados.
  app.use(cors({ exposedHeaders: ["X-Refreshed-Token"] }));
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/auth", authRouter);
  app.use("/auth/central", centralSsoRouter);
  app.use("/auth/microsoft", microsoftSsoRouter);
  app.use("/auth/govbr", govbrSsoRouter);
  app.use("/tenants", tenantsRouter);
  app.use("/crp", crpRouter);
  app.use("/pro-gestao", proGestaoRouter);
  app.use("/uploads", uploadsRouter);
  app.use("/construtor", construtorRouter);
  app.use("/portal-indicadores", portalIndicadoresRouter);
  app.use("/public/transparencia", transparenciaPublicRouter);
  app.use("/public/portal-previdenciario", portalPrevidenciarioPublicRouter);
  app.use("/admin", adminRouter);

  app.use(errorHandler);

  return app;
}
