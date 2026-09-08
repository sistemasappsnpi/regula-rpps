import { useEffect, useRef, useState } from "react";

export interface ComboBoxOption {
  value: string;
  label: string;
  sublabel?: string;
  // Opcional: quando presente em pelo menos uma opção, a lista é renderizada com um cabeçalho
  // antes do primeiro item de cada grupo (ex.: "Padrão" / "Personalizados" no Construtor de
  // Documentos) — respeita a ordem em que as opções chegam, nunca reordena por conta própria.
  group?: string;
}

/**
 * Select com busca — digitar filtra a lista pelo texto, em vez de precisar rolar um <select>
 * gigante (ex.: as 24 ações do Pró-Gestão no Construtor de Documentos).
 */
export function ComboBox({
  options,
  value,
  onChange,
  placeholder = "Digite para buscar…",
}: {
  options: ComboBoxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selecionado = options.find((o) => o.value === value);

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  const termo = query.trim().toLowerCase();
  const filtrados = termo
    ? options.filter((o) => `${o.label} ${o.sublabel ?? ""}`.toLowerCase().includes(termo))
    : options;

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={open ? query : (selecionado?.label ?? "")}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-petrol"
      />
      {open && (
        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-surface shadow-soft">
          {filtrados.length === 0 && <p className="px-3 py-2 text-sm text-ink-muted">Nenhum resultado.</p>}
          {filtrados.map((o, i) => (
            <div key={o.value}>
              {o.group && o.group !== filtrados[i - 1]?.group && (
                <p className="px-3 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-wide text-ink-muted first:pt-2">
                  {o.group}
                </p>
              )}
              <button
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                  setQuery("");
                }}
                className={`block w-full truncate px-3 py-2 text-left text-sm hover:bg-ink/5 ${
                  o.value === value ? "bg-petrol/10 text-petrol" : "text-ink"
                }`}
              >
                {o.label}
                {o.sublabel && <span className="ml-1 text-xs text-ink-muted">{o.sublabel}</span>}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
