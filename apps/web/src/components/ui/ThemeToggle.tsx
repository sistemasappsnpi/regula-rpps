import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { applyTheme, getStoredTheme, type Theme } from "../../lib/theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(getStoredTheme());
  }, []);

  function alternar() {
    const proximo: Theme = theme === "light" ? "dark" : "light";
    setTheme(proximo);
    applyTheme(proximo);
  }

  return (
    <button
      onClick={alternar}
      title={theme === "light" ? "Ativar modo escuro" : "Ativar modo claro"}
      className="flex h-8 w-8 items-center justify-center rounded-full text-sidebar-muted transition-colors hover:bg-white/10 hover:text-sidebar-ink"
    >
      {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
    </button>
  );
}
