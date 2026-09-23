import { ShieldAlert } from "lucide-react";
import { useAuth } from "../lib/auth-context";

// Estado válido e esperado pra um usuário autenticado pelo APP CENTRAL sem client_code vinculado
// lá (ver central-sso.routes.ts) — o login em si funcionou, só falta o vínculo com um RPPS.
// Nunca redireciona de volta pro /login (isso causaria loop, já que o token continua válido).
export function ContaNaoVinculadaPage() {
  const { user, logout } = useAuth();

  function sair() {
    logout();
    window.location.replace("/login");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 text-center shadow-soft">
        <ShieldAlert size={32} className="mx-auto mb-3 text-warn" />
        <p className="font-display text-lg font-bold text-ink">Sua conta ainda não está vinculada a nenhum RPPS</p>
        <p className="mt-2 text-sm text-ink-muted">
          {user ? `${user.name} (${user.email})` : "Sua conta"} entrou com sucesso pelo APP CENTRAL, mas ainda não tem um
          cliente vinculado por lá. Fale com o administrador do APP CENTRAL para associar sua conta a um RPPS.
        </p>
        <button onClick={sair} className="mt-5 text-sm font-medium text-petrol hover:underline">
          Sair e tentar com outra conta
        </button>
      </div>
    </div>
  );
}
