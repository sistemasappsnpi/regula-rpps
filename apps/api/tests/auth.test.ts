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

  it("criptografa o par de tokens do APP CENTRAL dentro do JWT e devolve igual na verificação", () => {
    const central = { accessToken: "acc-secreto", accessTokenExp: 123, refreshToken: "ref-secreto" };
    const token = signAuthToken({ userId: "u", tenantId: null, isSuperAdmin: true, authSource: "central", permissions: [], central });

    const payloadLegivel = Buffer.from(token.split(".")[1], "base64url").toString();
    expect(payloadLegivel).not.toContain("ref-secreto");
    expect(payloadLegivel).not.toContain("acc-secreto");
    expect(verifyAuthToken(token).central).toEqual(central);
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
