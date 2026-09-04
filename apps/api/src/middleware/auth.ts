import type { NextFunction, Request, Response } from "express";
import { verifyAuthToken } from "../utils/jwt";

export interface AuthenticatedRequest extends Request {
  auth?: {
    userId: string;
    tenantId: string | null;
    isSuperAdmin: boolean;
  };
}

/**
 * Resolve identidade a partir do JWT e anexa em req.auth. Nenhuma rota de negócio deve ler
 * tenantId de outro lugar (body, query, params) — essa é a única fonte de verdade para
 * isolamento entre RPPS distintos. tenantId pode ser null aqui (Super Admin da plataforma);
 * rotas escopadas a um tenant devem usar requireTenant() em seguida.
 */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token de autenticação ausente." });
    return;
  }

  try {
    const payload = verifyAuthToken(header.slice("Bearer ".length));
    req.auth = {
      userId: payload.userId,
      tenantId: payload.tenantId,
      isSuperAdmin: payload.isSuperAdmin,
    };
    next();
  } catch {
    res.status(401).json({ error: "Token de autenticação inválido ou expirado." });
  }
}

/** Usar após requireAuth em toda rota escopada a um tenant (CRP, Pró-Gestão, uploads, etc.). */
export function requireTenant(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.auth?.tenantId) {
    res.status(403).json({ error: "Esta rota exige um usuário vinculado a um RPPS (tenant)." });
    return;
  }
  next();
}

/** Usar após requireAuth em toda rota do Admin Global — nunca disponível a um usuário de tenant. */
export function requireSuperAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.auth?.isSuperAdmin) {
    res.status(403).json({ error: "Acesso restrito ao Super Admin da plataforma." });
    return;
  }
  next();
}
