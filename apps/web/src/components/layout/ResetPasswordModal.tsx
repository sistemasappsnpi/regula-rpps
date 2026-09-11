import { FormEvent, useState } from "react";
import { KeyRound } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { api } from "../../lib/api";

export function ResetPasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmarPassword: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [concluido, setConcluido] = useState(false);

  function fechar() {
    setForm({ currentPassword: "", newPassword: "", confirmarPassword: "" });
    setErro(null);
    setConcluido(false);
    onClose();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);

    if (form.newPassword !== form.confirmarPassword) {
      setErro("As senhas não coincidem.");
      return;
    }

    setEnviando(true);
    try {
      await api.changePassword(form.currentPassword, form.newPassword);
      setConcluido(true);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível trocar a senha.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal open={open} onClose={fechar} title="Resetar senha" icon={<KeyRound size={16} />} maxWidthClassName="max-w-sm">
      {concluido ? (
        <div className="text-center">
          <p className="text-sm text-ink">Senha alterada com sucesso.</p>
          <Button className="mt-4 w-full" onClick={fechar}>
            Fechar
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-ink">
            Senha atual
            <input
              type="password"
              value={form.currentPassword}
              onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-petrol"
              required
            />
          </label>

          <label className="mt-4 block text-sm font-medium text-ink">
            Nova senha
            <input
              type="password"
              value={form.newPassword}
              onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-petrol"
              minLength={8}
              required
            />
          </label>

          <label className="mt-4 block text-sm font-medium text-ink">
            Confirmar nova senha
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
            {enviando ? "Trocando…" : "Trocar senha"}
          </Button>
        </form>
      )}
    </Modal>
  );
}
