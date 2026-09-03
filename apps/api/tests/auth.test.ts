import { describe, expect, it } from "vitest";
import { hashPassword, comparePassword } from "../src/utils/password";
import { signAuthToken, verifyAuthToken } from "../src/utils/jwt";

describe("password hashing", () => {
  it("gera hashes diferentes para a mesma senha e ainda assim valida corretamente", async () => {
    const hash1 = await hashPassword("segredo-123");
    const hash2 = await hashPassword("segredo-123");

    expect(hash1).not.toBe(hash2);
    expect(await comparePassword("segredo-123", hash1)).toBe(true);
    expect(await comparePassword("senha-errada", hash1)).toBe(false);
  });
});

describe("JWT de autenticação", () => {
  it("assina e verifica o payload de tenant/papel corretamente", () => {
    const token = signAuthToken({ userId: "user-1", tenantId: "tenant-a", role: "RPPS_ADMIN" });
    const decoded = verifyAuthToken(token);

    expect(decoded.userId).toBe("user-1");
    expect(decoded.tenantId).toBe("tenant-a");
    expect(decoded.role).toBe("RPPS_ADMIN");
  });

  it("rejeita um token adulterado", () => {
    const token = signAuthToken({ userId: "user-1", tenantId: "tenant-a", role: "RPPS_ADMIN" });
    const tampered = token.slice(0, -2) + "xx";

    expect(() => verifyAuthToken(tampered)).toThrow();
  });
});
