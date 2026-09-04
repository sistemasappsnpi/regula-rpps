import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { Button } from "../components/ui/Button";

export function PrimeiroAcessoPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [tenantName, setTenantName] = useState<string | null>(null);
  const [erroLink, setErroLink] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const [form, setForm] = useState({ email: "", telefone: "", password: "", confirmarPassword: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [concluido, setConcluido] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .primeiroAcessoInfo(token)
      .then((res) => setTenantName(res.tenantName))
      .catch((err) => setErroLink(err instanceof Error ? err.message : "Link inválido."))
      .finally(() => setCarregando(false));
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setErro(null);

    if (form.password !== form.confirmarPassword) {
      setErro("As senhas não coincidem.");
      return;
    }

    setEnviando(true);
    try {
      await api.primeiroAcessoCompletar(token, { email: form.email, telefone: form.telefone, password: form.password });
      setConcluido(true);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível completar o cadastro.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src="/logo-npi.png" alt="NPI Brasil" className="mb-3 h-11 w-11 object-contain" />
          <p className="font-display text-2xl font-bold text-ink">Primeiro acesso</p>
          {tenantName && <p className="mt-1 text-sm text-ink-muted">{tenantName}</p>}
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-soft">
          {carregando && <p className="text-sm text-ink-muted">Verificando link…</p>}

          {!carregando && erroLink && <p className="text-sm text-crit">{erroLink}</p>}

          {!carregando && !erroLink && concluido && (
            <div className="text-center">
              <p className="text-sm text-ink">Cadastro concluído! Você já pode entrar com seu e-mail e a senha que definiu.</p>
              <Button className="mt-4 w-full" onClick={() => navigate("/login")}>
                Ir para o login
              </Button>
            </div>
          )}

          {!carregando && !erroLink && !concluido && (
            <form onSubmit={handleSubmit}>
              <p className="mb-4 text-xs text-ink-muted">
                Informe o e-mail com que você foi cadastrado, seu telefone e a senha que você quer usar a partir de agora.
              </p>

              <label className="block text-sm font-medium text-ink">
                E-mail
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-petrol"
                  required
                />
              </label>

              <label className="mt-4 block text-sm font-medium text-ink">
                Telefone
                <input
                  type="tel"
                  value={form.telefone}
                  onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-petrol"
                  required
                />
              </label>

              <label className="mt-4 block text-sm font-medium text-ink">
                Senha
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-petrol"
                  minLength={8}
                  required
                />
              </label>

              <label className="mt-4 block text-sm font-medium text-ink">
                Confirmar senha
                <input
                  type="password"
                  value={form.confirmarPassword}
                  onChange={(e) => setForm({ ...form, confirmarPassword: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-petrol"
                  minLength={8}
                  required
                />
              </label>

              {erro && <p className="mt-3 text-sm text-crit">{erro}</p>}

              <Button type="submit" className="mt-6 w-full" disabled={enviando}>
                {enviando ? "Concluindo…" : "Concluir cadastro"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
