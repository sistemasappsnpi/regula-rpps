import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { INPUT, Icone } from "./ui";

export interface GrupoEdit {
  nome: string;
  itens: number | null;
  icone: string;
  descricao: string;
  ocultar: boolean;
}

function SeletorIcone({
  ids,
  atual,
  onEscolher,
}: {
  ids: string[];
  atual: string;
  onEscolher: (id: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        title={atual || "automático"}
        onClick={() => setAberto((v) => !v)}
        className={`flex h-9 w-9 items-center justify-center rounded-lg border bg-surface text-xs text-ink-muted hover:border-petrol ${
          atual ? "border-border text-ink" : "border-dashed border-border"
        }`}
      >
        {atual ? <Icone id={atual} /> : "auto"}
      </button>
      {aberto && (
        <div className="absolute left-0 top-full z-30 mt-1 grid w-max grid-cols-7 gap-1 rounded-xl border border-border bg-surface p-2 shadow-lift">
          {ids.map((id) => (
            <button
              key={id}
              type="button"
              title={id}
              onClick={() => {
                onEscolher(id);
                setAberto(false);
              }}
              className={`flex h-9 w-9 items-center justify-center rounded-lg border text-ink hover:border-petrol ${
                atual === id ? "border-petrol bg-petrol/10" : "border-transparent bg-bg"
              }`}
            >
              <Icone id={id} />
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              onEscolher("");
              setAberto(false);
            }}
            className="col-span-7 rounded-lg bg-bg px-2 py-1.5 text-xs font-semibold text-ink hover:border-petrol"
          >
            Automático (pelo nome da categoria)
          </button>
        </div>
      )}
    </div>
  );
}

export function CategoriasStep({
  grupos,
  iconesIds,
  onMover,
  onMudar,
}: {
  grupos: GrupoEdit[];
  iconesIds: string[];
  onMover: (i: number, delta: -1 | 1) => void;
  onMudar: (i: number, patch: Partial<GrupoEdit>) => void;
}) {
  if (!grupos.length) {
    return (
      <div className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-ink-muted">
        Teste a API da Transparência (passo 1) para carregar as categorias.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-ink-muted">
            <th className="p-1.5" />
            <th className="p-1.5">Categoria</th>
            <th className="p-1.5">Ícone</th>
            <th className="hidden p-1.5 sm:table-cell">Descrição</th>
            <th className="p-1.5 text-center">Ocultar</th>
          </tr>
        </thead>
        <tbody>
          {grupos.map((g, i) => (
            <tr key={g.nome} className="border-t border-border">
              <td className="p-1.5">
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    aria-label="Subir"
                    disabled={i === 0}
                    onClick={() => onMover(i, -1)}
                    className="rounded border border-border p-0.5 text-ink-muted hover:border-petrol disabled:opacity-30"
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button
                    type="button"
                    aria-label="Descer"
                    disabled={i === grupos.length - 1}
                    onClick={() => onMover(i, 1)}
                    className="rounded border border-border p-0.5 text-ink-muted hover:border-petrol disabled:opacity-30"
                  >
                    <ArrowDown size={12} />
                  </button>
                </div>
              </td>
              <td className={`p-1.5 ${g.ocultar ? "opacity-45" : ""}`}>
                <div className="font-semibold text-ink">{g.nome}</div>
                <div className="text-xs text-ink-muted">{g.itens != null ? `${g.itens} itens` : "não veio na API"}</div>
              </td>
              <td className="p-1.5">
                <SeletorIcone ids={iconesIds} atual={g.icone} onEscolher={(id) => onMudar(i, { icone: id })} />
              </td>
              <td className={`hidden p-1.5 sm:table-cell ${g.ocultar ? "opacity-45" : ""}`}>
                <input
                  type="text"
                  className={INPUT}
                  value={g.descricao}
                  placeholder="Uma frase sobre o que tem nesta categoria"
                  onChange={(e) => onMudar(i, { descricao: e.target.value })}
                />
              </td>
              <td className="p-1.5 text-center">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[rgb(var(--color-petrol))]"
                  checked={g.ocultar}
                  aria-label={`Ocultar ${g.nome}`}
                  onChange={(e) => onMudar(i, { ocultar: e.target.checked })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
