import { useState } from "react";
import { Check, X } from "lucide-react";

export interface PermissaoItem {
  key: string;
  nome: string;
  descricao: string;
  grupo: string;
  /** Valor que valeria antes de um override neste nível (padrão do plano, ou herdado do RPPS). */
  heranca: boolean;
  /** Rótulo de onde vem `heranca`, ex.: "Padrão do plano: ativo" ou "Herdado do RPPS: ativo". */
  legendaHeranca: string;
  override: boolean | null;
  efetivo: boolean;
}

/**
 * Lista de permissões agrupada por aba, com toggle + "restaurar padrão" por item. Reaproveitada
 * tanto na aba Permissões de "Editar Cliente" (RPPS clientes) quanto na de um usuário Super
 * Admin (Admin → Usuários) — só muda de onde vêm os dados e o texto de herança de cada item.
 */
export function PermissoesEditor({
  permissoes,
  onToggle,
  onRestaurar,
  introducao,
}: {
  permissoes: PermissaoItem[];
  onToggle: (key: string, efetivoAtual: boolean) => void | Promise<void>;
  onRestaurar: (key: string) => void | Promise<void>;
  introducao?: string;
}) {
  const [salvandoChave, setSalvandoChave] = useState<string | null>(null);

  async function alternar(key: string, efetivoAtual: boolean) {
    setSalvandoChave(key);
    try {
      await onToggle(key, efetivoAtual);
    } finally {
      setSalvandoChave(null);
    }
  }

  async function restaurar(key: string) {
    setSalvandoChave(key);
    try {
      await onRestaurar(key);
    } finally {
      setSalvandoChave(null);
    }
  }

  const grupos = Array.from(new Set(permissoes.map((p) => p.grupo)));

  return (
    <div className="flex flex-col gap-5">
      {introducao && <p className="text-xs text-ink-muted">{introducao}</p>}

      {grupos.map((grupo) => (
        <div key={grupo}>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">{grupo}</p>
          <div className="flex flex-col gap-2">
            {permissoes
              .filter((p) => p.grupo === grupo)
              .map((p) => (
                <div key={p.key} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{p.nome}</p>
                    <p className="text-xs text-ink-muted">{p.descricao}</p>
                    <p className="mt-1 text-[11px] text-ink-muted">
                      {p.legendaHeranca}
                      {p.override !== null && (
                        <>
                          {" · "}
                          <span className="font-medium text-gold">personalizado</span>
                          {" — "}
                          <button onClick={() => restaurar(p.key)} className="underline hover:text-ink">
                            restaurar padrão
                          </button>
                        </>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => alternar(p.key, p.efetivo)}
                    disabled={salvandoChave === p.key}
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50 ${
                      p.efetivo ? "bg-ok/15 text-ok hover:bg-ok/25" : "bg-ink/5 text-ink-muted hover:bg-ink/10"
                    }`}
                    title={p.efetivo ? "Ativo — clique para desativar" : "Inativo — clique para ativar"}
                  >
                    {p.efetivo ? <Check size={16} /> : <X size={16} />}
                  </button>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
