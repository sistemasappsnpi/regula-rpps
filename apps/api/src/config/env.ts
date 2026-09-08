function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 3333),
  databaseUrl: process.env.DATABASE_URL ?? "",
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
  isTest: process.env.NODE_ENV === "test",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  uploadsDir: process.env.UPLOADS_DIR ?? "./uploads",
  // Base do frontend pra onde os fluxos de SSO redirecionam de volta o navegador depois do
  // login (nunca um fetch — é um redirect de navegador, não dá pra devolver JSON).
  webUrl: process.env.WEB_URL ?? "http://localhost:5173",

  microsoft: {
    clientId: process.env.MICROSOFT_CLIENT_ID ?? "",
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
    tenantId: process.env.MICROSOFT_TENANT_ID ?? "",
    // Fixo via env de propósito — nunca montado a partir do host da requisição, porque o Entra
    // ID exige bater exatamente com o que está cadastrado no App Registration.
    redirectUri: process.env.MICROSOFT_REDIRECT_URI ?? "",
    scopes: process.env.MICROSOFT_SCOPES ?? "openid profile email User.Read",
  },

  govbr: {
    enabled: process.env.GOVBR_ENABLED === "true",
    issuer: process.env.GOVBR_ISSUER ?? "",
    clientId: process.env.GOVBR_CLIENT_ID ?? "",
    clientSecret: process.env.GOVBR_CLIENT_SECRET ?? "",
    redirectUri: process.env.GOVBR_REDIRECT_URI ?? "",
    scopes: process.env.GOVBR_SCOPES ?? "openid email profile",
    // Padrões batem com a especificação: cria conta automaticamente por padrão, mas inativa
    // (precisa de um Super Admin liberar) até alguém decidir ligar PROVISION_ACTIVE.
    autoProvision: process.env.GOVBR_AUTO_PROVISION !== "false",
    provisionActive: process.env.GOVBR_PROVISION_ACTIVE === "true",
  },
};

export function isMicrosoftSsoConfigured(): boolean {
  return !!(env.microsoft.clientId && env.microsoft.clientSecret && env.microsoft.tenantId && env.microsoft.redirectUri);
}

export function isGovbrSsoConfigured(): boolean {
  return env.govbr.enabled && !!(env.govbr.issuer && env.govbr.clientId && env.govbr.clientSecret && env.govbr.redirectUri);
}

export function assertProductionEnv(): void {
  if (process.env.NODE_ENV === "production") {
    required("DATABASE_URL");
    required("JWT_SECRET");
  }
}
