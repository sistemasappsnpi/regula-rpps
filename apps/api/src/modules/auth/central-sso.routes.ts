import { Router, type Response } from "express";
import crypto from "node:crypto";
import type { Membership, Tenant } from "@prisma/client";
import { env, isCentralSsoConfigured } from "../../config/env";
import { createOAuthState, decodeOAuthState } from "../../utils/oauthState";
import { prisma } from "../../db/prisma";
import { slugify } from "../../utils/slugify";
import { crpRepository } from "../crp/crp.repository";
import { issueTokenForUser } from "./auth.service";
import type { CentralTokenBundle } from "../../utils/jwt";

/**
 * Login via APP CENTRAL — provedor único de login/permissionamento (OIDC Authorization Code +
 * PKCE). Login e permissionamento pra este provedor não usam mais as tabelas Feature locais: a
 * lista `permissions` do token é a fonte de verdade a cada login (ver middleware/features.ts).
 *
 * Upsert sempre — nunca recusa login por "usuário não cadastrado aqui" (regra explícita do
 * negócio). Tenant é resolvido pelo claim `client_code`:
 *   - presente: acha (ou auto-cria) o tenant correspondente e vincula via Membership.
 *   - ausente + alguma permissão com prefixo "admin_": vira Super Admin, sem tenant.
 *   - ausente + sem sinal de admin: login registrado, mas sem Membership — precisa de vínculo
 *     manual no APP CENTRAL (aparece no resumo final da migração como pendência conhecida).
 */
export const centralSsoRouter = Router();

interface CentralDiscovery {
  authorization_endpoint: string;
}

let discoveryCache: CentralDiscovery | null = null;

async function getDiscovery(): Promise<CentralDiscovery> {
  if (discoveryCache) return discoveryCache;
  const resp = await fetch(`${env.central.issuer}/.well-known/openid-configuration`);
  if (!resp.ok) throw new Error("Não foi possível obter a configuração OIDC do APP CENTRAL.");
  discoveryCache = (await resp.json()) as CentralDiscovery;
  return discoveryCache;
}

function redirectComErro(res: Response, mensagem: string): void {
  res.redirect(`${env.webUrl}/login?erro=${encodeURIComponent(mensagem)}`);
}

function base64UrlSha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("base64url");
}

interface CentralIdTokenClaims {
  sub: string;
  name?: string;
  email?: string;
  permissions?: string[];
  roles?: string[];
  client_code?: string | null;
}

// Sem verificação de assinatura: o id_token vem direto da troca POST server-to-server sobre TLS
// com o token endpoint do APP CENTRAL (mesmo nível de confiança que os fluxos Microsoft/gov.br já
// depositam na resposta HTTPS do provedor, ver govbr-sso.routes.ts) — nunca é aceito vindo de
// outro lugar (ex.: query string do navegador).
function decodeIdToken(idToken: string): CentralIdTokenClaims {
  const parts = idToken.split(".");
  if (parts.length < 2) throw new Error("id_token do APP CENTRAL em formato inesperado.");
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  if (typeof payload.sub !== "string") throw new Error("id_token do APP CENTRAL sem sub.");
  return payload as CentralIdTokenClaims;
}

centralSsoRouter.get("/login", async (_req, res) => {
  if (!isCentralSsoConfigured()) {
    redirectComErro(res, "Login com o APP CENTRAL não está disponível neste ambiente.");
    return;
  }

  try {
    const discovery = await getDiscovery();
    const codeVerifier = crypto.randomBytes(32).toString("base64url");
    const codeChallenge = base64UrlSha256(codeVerifier);
    const state = createOAuthState(codeVerifier);

    const authorizeUrl = new URL(discovery.authorization_endpoint);
    authorizeUrl.searchParams.set("client_id", env.central.clientId);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("redirect_uri", env.central.redirectUri);
    authorizeUrl.searchParams.set("scope", env.central.scopes);
    authorizeUrl.searchParams.set("code_challenge", codeChallenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    authorizeUrl.searchParams.set("state", state);
    res.redirect(authorizeUrl.toString());
  } catch {
    redirectComErro(res, "Não foi possível iniciar o login com o APP CENTRAL.");
  }
});

centralSsoRouter.get("/callback", async (req, res) => {
  if (!isCentralSsoConfigured()) {
    redirectComErro(res, "Login com o APP CENTRAL não está disponível neste ambiente.");
    return;
  }

  const { code, state } = req.query;
  const decodedState = decodeOAuthState(typeof state === "string" ? state : undefined);
  if (typeof code !== "string" || !decodedState?.cv) {
    redirectComErro(res, "Sessão de login com o APP CENTRAL expirou. Tente novamente.");
    return;
  }

  try {
    const tokenResp = await fetch(env.central.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: env.central.redirectUri,
        client_id: env.central.clientId,
        client_secret: env.central.clientSecret,
        code_verifier: decodedState.cv,
      }),
    });
    if (!tokenResp.ok) {
      redirectComErro(res, "Não foi possível confirmar o login com o APP CENTRAL.");
      return;
    }
    const tokenData = (await tokenResp.json()) as {
      access_token?: string;
      refresh_token?: string;
      id_token?: string;
      expires_in?: number;
    };
    if (!tokenData.access_token || !tokenData.refresh_token || !tokenData.id_token) {
      redirectComErro(res, "Resposta inesperada do APP CENTRAL ao confirmar o login.");
      return;
    }

    const claims = decodeIdToken(tokenData.id_token);
    if (!claims.email) {
      redirectComErro(res, "A conta do APP CENTRAL não retornou um e-mail.");
      return;
    }
    const permissions = claims.permissions ?? [];
    const isSuperAdmin = permissions.some((p) => p.startsWith("admin_"));

    // Upsert obrigatório: por sub primeiro (identificador estável do APP CENTRAL), por e-mail
    // como plano B (primeiro login desta conta, ou sub ainda não gravado) — nunca recusa login.
    let user = await prisma.user.findUnique({ where: { centralSub: claims.sub } });
    if (!user) user = await prisma.user.findUnique({ where: { email: claims.email } });

    if (!user) {
      user = await prisma.user.create({
        data: { centralSub: claims.sub, email: claims.email, name: claims.name ?? claims.email, isSuperAdmin, ativo: true },
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          centralSub: claims.sub,
          name: claims.name ?? user.name,
          isSuperAdmin,
          lastLoginAt: new Date(),
        },
      });
    }

    let memberships: (Membership & { tenant: Tenant })[] = [];
    if (claims.client_code) {
      let tenant = await prisma.tenant.findUnique({ where: { centralClientCode: claims.client_code } });
      if (!tenant) {
        const baseSlug = slugify(claims.client_code);
        let slug = baseSlug;
        let attempt = 1;
        while (await prisma.tenant.findUnique({ where: { slug } })) {
          slug = `${baseSlug}-${++attempt}`;
        }
        // Nasce mínimo/placeholder — um Super Admin completa os dados reais depois em
        // Admin → RPPS clientes → Editar (mesmo texto usado como nome/ente federativo por ora).
        tenant = await prisma.tenant.create({
          data: { name: claims.client_code, slug, federatedEntity: claims.client_code, centralClientCode: claims.client_code },
        });
        await crpRepository.ensureTenantRows(tenant.id);
      }

      const membership = await prisma.membership.upsert({
        where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
        update: {},
        create: { userId: user.id, tenantId: tenant.id },
      });
      memberships = [{ ...membership, tenant }];
    }
    // client_code ausente + sem sinal de admin: login segue registrado (upsert acima já
    // aconteceu), mas sem Membership — usuário cai na página de "conta não vinculada" no
    // frontend até alguém corrigir o vínculo no APP CENTRAL.

    const centralBundle: CentralTokenBundle = {
      accessToken: tokenData.access_token,
      accessTokenExp: Date.now() + (tokenData.expires_in ?? 3600) * 1000,
      refreshToken: tokenData.refresh_token,
    };

    const token = issueTokenForUser(user, memberships, { source: "central", permissions, central: centralBundle });
    res.redirect(`${env.webUrl}/sso-callback#token=${token}`);
  } catch {
    redirectComErro(res, "Erro inesperado ao entrar com o APP CENTRAL.");
  }
});
