import { useState } from "react";
import { Settings, KeyRound, LogOut } from "lucide-react";
import { getStoredTheme, applyTheme, type Theme } from "../../lib/theme";
import { ResetPasswordModal } from "./ResetPasswordModal";

export function SessionMenu({ onLogout }: { onLogout: () => void }) {
  const [theme, setTheme] = useState<Theme>(getStoredTheme());
  const [resetOpen, setResetOpen] = useState(false);

  function alternarTema() {
    const proximo: Theme = theme === "light" ? "dark" : "light";
    setTheme(proximo);
    applyTheme(proximo);
  }

  return (
    <>
      <div>
        <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-wider text-sidebar-section">Sessão</p>
        <nav className="flex flex-col gap-0.5">
          <button
            onClick={alternarTema}
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[13px] font-medium text-sidebar-muted transition-colors hover:bg-white/5 hover:text-sidebar-ink"
          >
            <Settings size={15} />
            {theme === "light" ? "Tema Claro" : "Tema Escuro"}
          </button>
          <button
            onClick={() => setResetOpen(true)}
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[13px] font-medium text-sidebar-muted transition-colors hover:bg-white/5 hover:text-sidebar-ink"
          >
            <KeyRound size={15} />
            Resetar Senha
          </button>
          <button
            onClick={onLogout}
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[13px] font-bold text-red-400 transition-colors hover:text-red-300"
          >
            <LogOut size={15} />
            Sair do Sistema
          </button>
        </nav>
      </div>

      <ResetPasswordModal open={resetOpen} onClose={() => setResetOpen(false)} />
    </>
  );
}
