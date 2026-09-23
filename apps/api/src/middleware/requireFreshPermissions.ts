import type { NextFunction, Response } from "express";
import { env } from "../config/env";
import { signAuthToken, type CentralTokenBundle } from "../utils/jwt";
import type { AuthenticatedRequest } from "./auth";

interface IntrospectResponse {
  active: boolean;
  permissions?: string[];
}

async function introspect(accessToken: string): Promise<IntrospectResponse> {
  const resp = await fetch(env.central.introspectUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: accessToken, client_id: env.central.clientId, client_secret: env.central.clientSecret }),
  });
  if (!resp.ok) return { active: false };
  return (await resp.json()) as IntrospectResponse;
}

async function refreshCentralToken(refreshToken: string): Promise<CentralTokenBundle | null> {
  const resp = await fetch(env.central.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: env.central.clientId,
      client_secret: env.central.clientSecret,
    }),
  });
  if (!resp.ok) return null;
  const data = (await resp.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!data.access_token || !data.refresh_token) return null;
  return {
    accessToken: data.access_token,
    accessTokenExp: Date.now() + (data.expires_in ?? 3600) * 1000,
    refreshToken: data.refresh_token,
  };
}

/**
 * Revalida a sessão do APP CENTRAL via /introspect antes de uma ação sensível (ex.: exclusões) —
 * a sessão local dura 8h e confia no JWT o resto do tempo (ver middleware/features.ts), mas uma
 * ação destrutiva merece confirmar que o acesso ainda está ativo *agora* no provedor.
 *
 * O `access_token` embutido no JWT local expira em 1h — bem antes da sessão de 8h — então quase
 * toda chamada aqui precisa trocar por um novo via refresh_token antes de poder chamar
 * /introspect. O refresh_token do APP CENTRAL é de uso único (rotativo): a troca invalida o
 * antigo e devolve um par novo, que precisa substituir o embutido no JWT local — como o JWT é
 * stateless, isso significa reemitir um token novo e devolvê-lo ao cliente (header
 * `X-Refreshed-Token`, ver apps/web/src/lib/api.ts) pra ele passar a mandar esse a partir de agora.
 *
 * Usuários "legacy" (Microsoft/gov.br) não têm token do APP CENTRAL pra revalidar — a checagem de
 * `requireFeature`/`requireAdminFeature` já rodou antes desta, então aqui só passa direto.
 */
export function requireFreshPermissions(requiredPermission?: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (req.auth!.authSource !== "central") {
      next();
      return;
    }

    let central = req.auth!.central;
    if (!central) {
      res.status(401).json({ error: "Sessão do APP CENTRAL inválida. Faça login novamente." });
      return;
    }

    let permissions = req.auth!.permissions ?? [];
    let tokenParaIntrospect = central.accessToken;

    // Margem de 30s pra não correr risco de o /introspect ver o token vencido entre a checagem
    // aqui e a chegada da requisição lá.
    if (central.accessTokenExp <= Date.now() + 30_000) {
      const refreshed = await refreshCentralToken(central.refreshToken);
      if (!refreshed) {
        res.status(401).json({ error: "Sua sessão com o APP CENTRAL expirou. Faça login novamente para continuar." });
        return;
      }
      central = refreshed;
      tokenParaIntrospect = refreshed.accessToken;

      const newToken = signAuthToken({
        userId: req.auth!.userId,
        tenantId: req.auth!.tenantId,
        isSuperAdmin: req.auth!.isSuperAdmin,
        authSource: "central",
        permissions,
        central: refreshed,
      });
      res.setHeader("X-Refreshed-Token", newToken);
      req.auth!.central = refreshed;
    }

    const result = await introspect(tokenParaIntrospect);
    if (!result.active) {
      res.status(401).json({ error: "Sua sessão com o APP CENTRAL não está mais ativa. Faça login novamente." });
      return;
    }
    if (result.permissions) {
      permissions = result.permissions;
      req.auth!.permissions = permissions;
    }
    if (requiredPermission && !permissions.includes(requiredPermission)) {
      res.status(403).json({ error: "Esta ação não está mais disponível para o seu usuário.", featureKey: requiredPermission });
      return;
    }

    next();
  };
}
