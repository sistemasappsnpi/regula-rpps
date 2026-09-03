import type { NextFunction, Request, Response } from "express";
import { verifyAuthToken } from "../utils/jwt";
import type { Role } from "@prisma/client";

export interface AuthenticatedRequest extends Request {
  auth?: {
    userId: string;
    tenantId: string;
    role: Role;
  };
}

/**
 * Resolve tenantId/role a partir do JWT e anexa em req.auth.
 * Nenhuma rota de negócio deve ler tenantId de outro lugar (body, query, params) —
 * essa é a única fonte de verdade para isolamento entre RPPS distintos.
 */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token de autenticação ausente." });
    return;
  }

  try {
    const payload = verifyAuthToken(header.slice("Bearer ".length));
    req.auth = { userId: payload.userId, tenantId: payload.tenantId, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: "Token de autenticação inválido ou expirado." });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      res.status(403).json({ error: "Você não tem permissão para executar esta ação." });
      return;
    }
    next();
  };
}
