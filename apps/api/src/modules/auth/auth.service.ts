import type { Membership, Tenant, User } from "@prisma/client";
import { signAuthToken, type CentralTokenBundle } from "../../utils/jwt";
import { HttpError } from "../../middleware/errorHandler";

/**
 * Emite o JWT pra um usuário já resolvido por SSO (ver central-sso.routes.ts,
 * microsoft-sso.routes.ts, govbr-sso.routes.ts) — mesma regra em todo lugar: Super Admin nunca
 * carrega tenantId, usuário de tenant precisa de ao menos um Membership (MVP: usa o primeiro).
 *
 * `authSource` decide como o resto do sistema resolve permissão (ver middleware/features.ts):
 * "central" confia na lista `permissions` do APP CENTRAL, sem nenhuma consulta ao banco; "legacy"
 * (Microsoft/gov.br) continua consultando as tabelas Feature/PlanFeature/TenantFeature/UserFeature
 * como sempre. `central` (par access/refresh token do APP CENTRAL) só existe pra authSource
 * "central" — usado por requireFreshPermissions() pra revalidar em ações sensíveis.
 */
export function issueTokenForUser(
  user: Pick<User, "id" | "isSuperAdmin">,
  memberships: (Membership & { tenant: Tenant })[],
  auth: { source: "legacy" } | { source: "central"; permissions: string[]; central: CentralTokenBundle },
): string {
  const base = {
    userId: user.id,
    isSuperAdmin: user.isSuperAdmin,
    authSource: auth.source,
    ...(auth.source === "central" ? { permissions: auth.permissions, central: auth.central } : {}),
  };

  if (user.isSuperAdmin) {
    return signAuthToken({ ...base, tenantId: null });
  }
  if (memberships.length === 0) {
    // Pra login "central": isto é um estado válido e esperado (usuário existe no APP CENTRAL
    // mas ainda sem client_code vinculado lá) — nunca recusamos o login, o frontend mostra uma
    // tela de "conta não vinculada" em vez de deixar o usuário entrar (ver App.tsx). Pra login
    // "legacy" (Microsoft/gov.br), mantém o comportamento de sempre: sem Membership não entra.
    if (auth.source === "legacy") {
      throw new HttpError(401, "Este usuário não está vinculado a nenhum RPPS.");
    }
    return signAuthToken({ ...base, tenantId: null });
  }
  return signAuthToken({ ...base, tenantId: memberships[0].tenantId });
}
