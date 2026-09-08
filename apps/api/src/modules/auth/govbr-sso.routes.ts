import { Router, type Response } from "express";
import { env, isGovbrSsoConfigured } from "../../config/env";
import { createOAuthState, verifyOAuthState } from "../../utils/oauthState";
import { prisma } from "../../db/prisma";
import { hashPassword } from "../../utils/password";
import { issueTokenForUser } from "./auth.service";
import crypto from "node:crypto";

/**
 * Login com gov.br — OIDC padrão via discovery document. Diferente do Microsoft SSO, aqui pode
 * criar conta automaticamente (GOVBR_AUTO_PROVISION, ligado por padrão) — mas nasce inativa
 * (GOVBR_PROVISION_ACTIVE=false por padrão) até um Super Admin liberar e vincular a um RPPS,
 * exatamente como qualquer usuário pré-cadastrado manualmente.
 *
 * Simplificação assumida: casa só por e-mail (não por "sub" do provedor) — o modelo User do
 * Regula RPPS não guarda identificador externo de provedor; adicionar isso é um passo futuro se
 * o e-mail retornado pelo gov.br não for confiável o suficiente na prática.
 */
export const govbrSsoRouter = Router();

interface GovbrDiscovery {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
}

let discoveryCache: GovbrDiscovery | null = null;

async function getDiscovery(): Promise<GovbrDiscovery> {
  if (discoveryCache) return discoveryCache;
  const resp = await fetch(`${env.govbr.issuer}/.well-known/openid-configuration`);
  if (!resp.ok) throw new Error("Não foi possível obter a configuração OIDC do gov.br.");
  discoveryCache = (await resp.json()) as GovbrDiscovery;
  return discoveryCache;
}

function redirectComErro(res: Response, mensagem: string): void {
  res.redirect(`${env.webUrl}/login?erro=${encodeURIComponent(mensagem)}`);
}

govbrSsoRouter.get("/login", async (_req, res) => {
  if (!isGovbrSsoConfigured()) {
    redirectComErro(res, "Login com gov.br não está disponível neste ambiente.");
    return;
  }

  try {
    const discovery = await getDiscovery();
    const state = createOAuthState();
    const authorizeUrl = new URL(discovery.authorization_endpoint);
    authorizeUrl.searchParams.set("client_id", env.govbr.clientId);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("redirect_uri", env.govbr.redirectUri);
    authorizeUrl.searchParams.set("scope", env.govbr.scopes);
    authorizeUrl.searchParams.set("state", state);
    res.redirect(authorizeUrl.toString());
  } catch {
    redirectComErro(res, "Não foi possível iniciar o login com gov.br.");
  }
});

govbrSsoRouter.get("/callback", async (req, res) => {
  if (!isGovbrSsoConfigured()) {
    redirectComErro(res, "Login com gov.br não está disponível neste ambiente.");
    return;
  }

  const { code, state } = req.query;
  if (typeof code !== "string" || !verifyOAuthState(typeof state === "string" ? state : undefined)) {
    redirectComErro(res, "Sessão de login com o gov.br expirou. Tente novamente.");
    return;
  }

  try {
    const discovery = await getDiscovery();

    const tokenResp = await fetch(discovery.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.govbr.clientId,
        client_secret: env.govbr.clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: env.govbr.redirectUri,
      }),
    });
    if (!tokenResp.ok) {
      redirectComErro(res, "Não foi possível confirmar o login com o gov.br.");
      return;
    }
    const tokenData = (await tokenResp.json()) as { access_token?: string };
    if (!tokenData.access_token) {
      redirectComErro(res, "Não foi possível confirmar o login com o gov.br.");
      return;
    }

    const userinfoResp = await fetch(discovery.userinfo_endpoint, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!userinfoResp.ok) {
      redirectComErro(res, "Não foi possível obter os dados da conta gov.br.");
      return;
    }
    const userinfo = (await userinfoResp.json()) as { email?: string; name?: string };
    if (!userinfo.email) {
      redirectComErro(res, "A conta gov.br não retornou um e-mail.");
      return;
    }

    let user = await prisma.user.findUnique({
      where: { email: userinfo.email },
      include: { memberships: { include: { tenant: true } } },
    });

    if (!user) {
      if (!env.govbr.autoProvision) {
        redirectComErro(res, "Não existe conta cadastrada para este e-mail no Regula RPPS.");
        return;
      }
      // Senha aleatória e descartada na hora — este usuário só consegue entrar via gov.br até
      // um admin definir uma senha local pra ele (ou nunca, se preferir manter só SSO).
      const passwordHash = await hashPassword(crypto.randomBytes(32).toString("hex"));
      const created = await prisma.user.create({
        data: {
          name: userinfo.name ?? userinfo.email,
          email: userinfo.email,
          passwordHash,
          ativo: env.govbr.provisionActive,
        },
      });
      user = { ...created, memberships: [] };
    }

    if (!user.ativo) {
      redirectComErro(res, "Sua conta ainda não foi ativada por um administrador do Regula RPPS.");
      return;
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const token = issueTokenForUser(user, user.memberships);
    res.redirect(`${env.webUrl}/sso-callback#token=${token}`);
  } catch {
    redirectComErro(res, "Erro inesperado ao entrar com o gov.br.");
  }
});
