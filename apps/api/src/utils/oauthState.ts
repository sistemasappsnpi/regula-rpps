import crypto from "node:crypto";
import { env } from "../config/env";

const MAX_AGE_MS = 10 * 60 * 1000; // 10 min pra completar o login antes do state expirar

/**
 * Proteção anti-CSRF (state) pro fluxo OAuth/OIDC, sem precisar de sessão de servidor: o
 * Regula RPPS é uma SPA autenticada por JWT, nunca teve sessão de cookie — em vez de guardar o
 * state num store server-side, ele carrega a própria expiração e vem assinado com o mesmo
 * segredo do JWT (HMAC-SHA256). Verificação = confere assinatura + expiração, sem tocar banco.
 */
// `codeVerifier` é opcional — só o fluxo PKCE (central-sso.routes.ts) usa; embutir aqui evita
// precisar de um storage novo só pra guardar o code_verifier entre o /login e o /callback.
export function createOAuthState(codeVerifier?: string): string {
  const payload = JSON.stringify({
    nonce: crypto.randomBytes(16).toString("hex"),
    exp: Date.now() + MAX_AGE_MS,
    ...(codeVerifier ? { cv: codeVerifier } : {}),
  });
  const payloadB64 = Buffer.from(payload).toString("base64url");
  const signature = crypto.createHmac("sha256", env.jwtSecret).update(payloadB64).digest("base64url");
  return `${payloadB64}.${signature}`;
}

export function verifyOAuthState(state: string | undefined): boolean {
  return !!decodeOAuthState(state);
}

/** Igual a verifyOAuthState, mas devolve o payload (incluindo `cv`, se houver) em vez de bool. */
export function decodeOAuthState(state: string | undefined): { exp: number; cv?: string } | null {
  if (!state) return null;
  const [payloadB64, signature] = state.split(".");
  if (!payloadB64 || !signature) return null;

  const expected = crypto.createHmac("sha256", env.jwtSecret).update(payloadB64).digest("base64url");
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString()) as { exp?: number; cv?: string };
    if (typeof payload.exp !== "number" || payload.exp <= Date.now()) return null;
    return { exp: payload.exp, cv: payload.cv };
  } catch {
    return null;
  }
}
