import { useState } from "react";
import { Moon, Sun, LogOut } from "lucide-react";
import { getStoredTheme, applyTheme, type Theme } from "../../lib/theme";

// Cartão do usuário (avatar com iniciais) + ações de sessão, no rodapé do menu lateral.
export function SessionMenu({
  name,
  detail,
  onLogout,
}: {
  name: string;
  detail?: string;
  onLogout: () => void;
}) {
  const [theme, setTheme] = useState<Theme>(getStoredTheme());

  function alternarTema() {
    const proximo: Theme = theme === "light" ? "dark" : "light";
    setTheme(proximo);
    applyTheme(proximo);
  }

  const iniciais =
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?";

  return (
    <>
      <div className="flex items-center gap-3 px-1">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-petrol/10 text-sm font-semibold text-petrol">
          {iniciais}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-sidebar-ink">{name}</p>
          {detail && <p className="truncate text-xs text-sidebar-muted">{detail}</p>}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={alternarTema}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-sidebar-border px-3 py-2 text-xs font-medium text-sidebar-muted hover:bg-ink/[0.05] hover:text-sidebar-ink active:scale-[0.97]"
        >
          {theme === "light" ? <Moon size={14} /> : <Sun size={14} />}
          {theme === "light" ? "Escuro" : "Claro"}
        </button>
        <button
          onClick={onLogout}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-sidebar-border px-3 py-2 text-xs font-medium text-crit hover:bg-crit/10 active:scale-[0.97]"
        >
          <LogOut size={14} />
          Sair
        </button>
      </div>
    </>
  );
}
