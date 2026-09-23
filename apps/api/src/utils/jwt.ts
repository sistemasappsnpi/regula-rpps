import jwt from "jsonwebtoken";
import { env } from "../config/env";

/** Par de tokens do APP CENTRAL embutido no JWT local, só pra usuários authSource "central" —
 * usado por requireFreshPermissions() pra revalidar via /introspect sem exigir novo login. */
export interface CentralTokenBundle {
  accessToken: string;
  accessTokenExp: number; // epoch ms
  refreshToken: string;
}

export interface AuthTokenPayload {
  userId: string;
  // null para o Super Admin da plataforma, que nunca está vinculado a um tenant específico.
  tenantId: string | null;
  isSuperAdmin: boolean;
  // "central" = login via APP CENTRAL (permissions vem do token, ver item 2 da migração).
  // "legacy" = Microsoft/gov.br, permissionamento continua vindo das tabelas Feature locais.
  authSource: "central" | "legacy";
  // Só presente quando authSource === "central" — lista exata de permission codes do APP CENTRAL.
  permissions?: string[];
  central?: CentralTokenBundle;
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: "8h" });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.jwtSecret) as AuthTokenPayload;
}
