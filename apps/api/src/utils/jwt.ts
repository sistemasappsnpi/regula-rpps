import crypto from "node:crypto";
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

// O JWT é só base64 (assinado, não criptografado) e fica no localStorage do navegador — o par
// access/refresh do APP CENTRAL (refresh vale 30 dias) não pode ficar legível ali. Vai
// criptografado com AES-256-GCM, com chave derivada do segredo do servidor; só o backend abre.
function bundleKey(): Buffer {
  return crypto.createHash("sha256").update(`central-bundle:${env.jwtSecret}`).digest();
}

function encryptBundle(bundle: CentralTokenBundle): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", bundleKey(), iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(bundle), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64url");
}

function decryptBundle(blob: string): CentralTokenBundle {
  const raw = Buffer.from(blob, "base64url");
  const decipher = crypto.createDecipheriv("aes-256-gcm", bundleKey(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  const pt = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
  return JSON.parse(pt.toString("utf8")) as CentralTokenBundle;
}

export function signAuthToken(payload: AuthTokenPayload): string {
  const { central, ...rest } = payload;
  const claims = central ? { ...rest, centralEnc: encryptBundle(central) } : rest;
  return jwt.sign(claims, env.jwtSecret, { expiresIn: "8h" });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  const { centralEnc, ...decoded } = jwt.verify(token, env.jwtSecret) as AuthTokenPayload & { centralEnc?: string };
  return centralEnc ? { ...decoded, central: decryptBundle(centralEnc) } : decoded;
}
