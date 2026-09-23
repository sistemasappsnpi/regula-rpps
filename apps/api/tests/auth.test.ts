import { describe, expect, it } from "vitest";
import { signAuthToken, verifyAuthToken } from "../src/utils/jwt";

describe("JWT de autenticação", () => {
  it("assina e verifica o payload de tenant/permissões corretamente", () => {
    const token = signAuthToken({
      userId: "user-1",
      tenantId: "tenant-a",
      isSuperAdmin: false,
      authSource: "central",
      permissions: ["crp_compliance"],
    });
    const decoded = verifyAuthToken(token);

    expect(decoded.userId).toBe("user-1");
    expect(decoded.tenantId).toBe("tenant-a");
    expect(decoded.authSource).toBe("central");
    expect(decoded.permissions).toEqual(["crp_compliance"]);
  });

  it("assina um token legacy sem lista de permissões", () => {
    const token = signAuthToken({ userId: "user-1", tenantId: "tenant-a", isSuperAdmin: false, authSource: "legacy" });
    const decoded = verifyAuthToken(token);

    expect(decoded.authSource).toBe("legacy");
    expect(decoded.permissions).toBeUndefined();
  });

  it("rejeita um token adulterado", () => {
    const token = signAuthToken({ userId: "user-1", tenantId: "tenant-a", isSuperAdmin: false, authSource: "legacy" });
    const tampered = token.slice(0, -2) + "xx";

    expect(() => verifyAuthToken(tampered)).toThrow();
  });
});
