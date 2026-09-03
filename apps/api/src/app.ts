import express from "express";
import cors from "cors";
import { authRouter } from "./modules/auth/auth.routes";
import { tenantsRouter } from "./modules/tenants/tenants.routes";
import { crpRouter } from "./modules/crp/crp.routes";
import { errorHandler } from "./middleware/errorHandler";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/auth", authRouter);
  app.use("/tenants", tenantsRouter);
  app.use("/crp", crpRouter);

  app.use(errorHandler);

  return app;
}
