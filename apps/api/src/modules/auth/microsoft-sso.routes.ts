import { Router, type Response } from "express";
import { env, isMicrosoftSsoConfigured } from "../../config/env";
import { createOAuthState, verifyOAuthState } from "../../utils/oauthState";
import { prisma } from "../../db/prisma";
import { issueTokenForUser } from "./auth.service";

/**
 * Login com Microsoft (Entra ID) — OAuth2 Authorization Code puro, sem SDK. Regra de negócio
 * pedida: nunca cria usuário — só entra quem já está cadastrado no Regula RPPS com o e-mail da
 * conta Microsoft. O botão em si só aparece no frontend se GET /auth/providers disser que está
 * configurado (ver auth.routes.ts) — nunca um botão morto.
 */
export const microsoftSsoRouter = Router();

function redirectComErro(res: Response, mensagem: string): void {
  res.redirect(`${env.webUrl}/login?erro=${encodeURIComponent(mensagem)}`);
}

microsoftSsoRouter.get("/login", (_req, res) => {
  if (!isMicrosoftSsoConfigured()) {
    redirectComErro(res, "Login com Microsoft não está disponível neste ambiente.");
    return;
  }

  const state = createOAuthState();
  const authorizeUrl = new URL(`https://login.microsoftonline.com/${env.microsoft.tenantId}/oauth2/v2.0/authorize`);
  authorizeUrl.searchParams.set("client_id", env.microsoft.clientId);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("redirect_uri", env.microsoft.redirectUri);
  authorizeUrl.searchParams.set("scope", env.microsoft.scopes);
  authorizeUrl.searchParams.set("state", state);
  res.redirect(authorizeUrl.toString());
});

microsoftSsoRouter.get("/callback", async (req, res) => {
  if (!isMicrosoftSsoConfigured()) {
    redirectComErro(res, "Login com Microsoft não está disponível neste ambiente.");
    return;
  }

  const { code, state } = req.query;
  if (typeof code !== "string" || !verifyOAuthState(typeof state === "string" ? state : undefined)) {
    redirectComErro(res, "Sessão de login com a Microsoft expirou. Tente novamente.");
    return;
  }

  try {
    const tokenResp = await fetch(`https://login.microsoftonline.com/${env.microsoft.tenantId}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.microsoft.clientId,
        client_secret: env.microsoft.clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: env.microsoft.redirectUri,
        scope: env.microsoft.scopes,
      }),
    });
    if (!tokenResp.ok) {
      redirectComErro(res, "Não foi possível confirmar o login com a Microsoft.");
      return;
    }
    const tokenData = (await tokenResp.json()) as { access_token?: string };
    if (!tokenData.access_token) {
      redirectComErro(res, "Não foi possível confirmar o login com a Microsoft.");
      return;
    }

    const meResp = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!meResp.ok) {
      redirectComErro(res, "Não foi possível obter os dados da conta Microsoft.");
      return;
    }
    const me = (await meResp.json()) as { mail?: string; userPrincipalName?: string };
    const email = me.mail ?? me.userPrincipalName;
    if (!email) {
      redirectComErro(res, "A conta Microsoft não retornou um e-mail.");
      return;
    }

    // Nunca cria usuário via Microsoft — regra de negócio pedida explicitamente.
    const user = await prisma.user.findUnique({
      where: { email },
      include: { memberships: { include: { tenant: true } } },
    });
    if (!user || !user.ativo) {
      redirectComErro(res, "Não existe conta ativa para este e-mail no Regula RPPS.");
      return;
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const token = issueTokenForUser(user, user.memberships);
    res.redirect(`${env.webUrl}/sso-callback#token=${token}`);
  } catch {
    redirectComErro(res, "Erro inesperado ao entrar com a Microsoft.");
  }
});
