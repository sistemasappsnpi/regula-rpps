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
};

export function assertProductionEnv(): void {
  if (process.env.NODE_ENV === "production") {
    required("DATABASE_URL");
    required("JWT_SECRET");
  }
}
