import { Fragment, useDeferredValue, useEffect, useMemo, useRef, type ReactNode } from "react";
import { CornerDownLeft, Lightbulb, Search, Sparkles, X } from "lucide-react";
import { criarMotorBusca, norm, type DocBusca, type MotorBusca, type ResultadoBusca } from "../../lib/buscaInteligente";

// Busca das páginas do Portal Previdenciário (cada página só entrega os documentos a indexar):
// campo grande com brilho ao focar, atalho "/" para focar e Esc para limpar, sugestões clicáveis,
// resumo do resultado ("mostrando resultados para…", "mais parecidos") e destaque dos termos nos textos.
// Motor: lib/buscaInteligente.ts (porta do motor de busca do modelo do gerador de transparência).

export function useBusca(docs: DocBusca[], consulta: string): { motor: MotorBusca; resultado: ResultadoBusca | null } {
  const motor = useMemo(() => criarMotorBusca(docs), [docs]);
  // useDeferredValue: digitar nunca trava, mesmo em páginas com centenas de registros
  const adiada = useDeferredValue(consulta);
  const resultado = useMemo(() => (adiada.trim() ? motor.buscar(adiada) : null), [motor, adiada]);
  return { motor, resultado };
}

export function CampoBusca({
  valor,
  onChange,
  placeholder,
  sugestoes,
  rotuloItens,
}: {
  valor: string;
  onChange: (v: string) => void;
  placeholder: string;
  sugestoes: string[];
  rotuloItens: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  // "/" foca a busca de qualquer lugar da página (como nos sites de documentação)
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      const digitando = alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.tagName === "SELECT" || alvo.isContentEditable);
      if (e.key === "/" && !digitando && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  return (
    <div>
      <div className="group relative">
        {/* brilho atrás do campo, aparece ao focar */}
        <div className="pointer-events-none absolute -inset-1 rounded-2xl bg-gradient-to-r from-petrol/40 via-gold/40 to-petrol/40 opacity-0 blur-md transition-opacity duration-300 group-focus-within:opacity-100" />
        <label className="relative flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5 shadow-soft transition-colors group-focus-within:border-petrol">
          <Search size={20} className="shrink-0 text-petrol" />
          <input
            ref={ref}
            value={valor}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onChange("");
            }}
            placeholder={placeholder}
            aria-label={`Pesquisar ${rotuloItens}`}
            autoComplete="off"
            spellCheck={false}
            className="w-full bg-transparent text-base text-ink outline-none placeholder:text-ink-muted"
          />
          {valor ? (
            <button
              type="button"
              onClick={() => {
                onChange("");
                ref.current?.focus();
              }}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-ink/10 hover:text-ink"
              title="Limpar (Esc)"
            >
              <X size={16} />
            </button>
          ) : (
            <kbd className="hidden shrink-0 rounded-md border border-border bg-bg px-2 py-0.5 text-xs font-semibold text-ink-muted sm:block" title="Atalho para pesquisar">
              /
            </kbd>
          )}
        </label>
      </div>

      {!valor && sugestoes.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
            <Lightbulb size={13} className="text-gold" /> Experimente:
          </span>
          {sugestoes.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange(s)}
              className="rounded-full border border-border bg-bg px-3 py-1 text-xs font-medium text-ink transition-colors hover:border-petrol hover:text-petrol"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Linha de resumo logo abaixo do campo: quantos achou, correção de digitação, "mais parecidos"…
export function ResumoBusca({
  consulta,
  resultado,
  total,
  rotuloItens,
  extra,
}: {
  consulta: string;
  resultado: ResultadoBusca;
  total: number;
  rotuloItens: string;
  extra?: ReactNode;
}) {
  const n = resultado.ids.length;
  return (
    <div className="mt-3 flex flex-wrap items-start gap-x-2 gap-y-1 text-sm text-ink-muted" role="status" aria-live="polite">
      <Sparkles size={15} className="mt-0.5 shrink-0 text-gold" />
      <p className="min-w-0 flex-1">
        <strong className="text-ink">{n}</strong> de {total} {rotuloItens} para “<span className="text-ink">{consulta.trim()}</span>”
        {resultado.corrigido && (
          <>
            {" "}— mostrando resultados para “<span className="font-semibold text-petrol">{resultado.corrigido}</span>”
          </>
        )}
        {resultado.parecidos && <> — nenhum resultado exato, estes são os mais parecidos</>}
        {!resultado.parecidos && n > 1 && <> — do mais ao menos relevante</>}.{extra && <> {extra}</>}
      </p>
      <span className="hidden items-center gap-1 text-xs sm:flex">
        <CornerDownLeft size={12} /> Esc limpa
      </span>
    </div>
  );
}

// Destaca os termos buscados dentro de um texto, ignorando acento e maiúscula/minúscula.
export function Destaque({ texto, termos }: { texto: string; termos: string[] }) {
  const partes = useMemo(() => {
    if (!texto || termos.length === 0) return null;
    // texto normalizado caractere a caractere, pra os índices baterem com o original
    let normalizado = "";
    const mapa: number[] = []; // posição no normalizado -> posição no original
    for (let i = 0; i < texto.length; i++) {
      const n = norm(texto[i]);
      for (let k = 0; k < n.length; k++) {
        normalizado += n[k];
        mapa.push(i);
      }
    }
    const marcado = new Array<boolean>(texto.length).fill(false);
    let achou = false;
    for (const termo of termos) {
      if (termo.length < 2) continue;
      let pos = normalizado.indexOf(termo);
      while (pos !== -1) {
        for (let k = pos; k < pos + termo.length; k++) marcado[mapa[k]] = true;
        achou = true;
        pos = normalizado.indexOf(termo, pos + termo.length);
      }
    }
    if (!achou) return null;
    const saida: { t: string; m: boolean }[] = [];
    for (let i = 0; i < texto.length; i++) {
      const ult = saida[saida.length - 1];
      if (ult && ult.m === marcado[i]) ult.t += texto[i];
      else saida.push({ t: texto[i], m: marcado[i] });
    }
    return saida;
  }, [texto, termos]);

  if (!partes) return <>{texto}</>;
  return (
    <>
      {partes.map((p, i) =>
        p.m ? (
          <mark key={i} className="rounded bg-gold/25 px-0.5 text-inherit">
            {p.t}
          </mark>
        ) : (
          <Fragment key={i}>{p.t}</Fragment>
        ),
      )}
    </>
  );
}
