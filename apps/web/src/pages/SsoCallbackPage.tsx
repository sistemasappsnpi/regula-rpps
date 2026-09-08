import { useEffect } from "react";
import { setToken } from "../lib/api";

// Destino do redirect final do backend depois de um login por SSO bem-sucedido (Microsoft ou
// gov.br — ver microsoft-sso.routes.ts/govbr-sso.routes.ts), com o JWT no fragmento da URL
// (#token=..., nunca query string, pra não sobrar no log de acesso do servidor). Salva o token e
// dá reload completo pra /  — o AuthProvider relê o token do zero no mount (mesmo caminho de
// quando alguém já chega com um token salvo de uma sessão anterior, ver auth-context.tsx).
export function SsoCallbackPage() {
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token");
    if (token) {
      setToken(token);
      window.location.replace("/");
    } else {
      window.location.replace("/login?erro=Não foi possível completar o login.");
    }
  }, []);

  return <div className="flex min-h-screen items-center justify-center text-sm text-ink-muted">Entrando…</div>;
}
