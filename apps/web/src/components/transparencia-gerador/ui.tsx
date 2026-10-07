import type { ReactNode } from "react";
import { Card } from "../ui/Card";

export const INPUT =
  "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-petrol";

export function Passo({
  n,
  titulo,
  dica,
  children,
}: {
  n: number;
  titulo: string;
  dica?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2.5 text-base font-semibold text-ink">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-petrol text-xs font-bold text-on-petrol">
          {n}
        </span>
        {titulo}
      </h2>
      {dica && <p className="mb-4 mt-1 text-sm text-ink-muted">{dica}</p>}
      {!dica && <div className="mb-3" />}
      {children}
    </Card>
  );
}

export function Campo({
  label,
  hint,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1 block font-medium text-ink">
        {label} {hint && <span className="font-normal text-ink-muted">· {hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function Check({
  checked,
  onChange,
  children,
  className = "",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex cursor-pointer items-center gap-2 text-sm text-ink ${className}`}>
      <input
        type="checkbox"
        className="h-4 w-4 accent-[rgb(var(--color-petrol))]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {children}
    </label>
  );
}

export type StatusTipo = "ok" | "bad" | "load";

export function Status({ tipo, children }: { tipo: StatusTipo; children: ReactNode }) {
  const cls =
    tipo === "ok" ? "bg-ok/10 text-ok" : tipo === "bad" ? "bg-crit/10 text-crit" : "bg-ink-muted/10 text-ink-muted";
  return <div className={`mt-2 rounded-lg px-3 py-2 text-xs ${cls}`}>{children}</div>;
}

/** Ícone do sprite injetado pela página (<symbol id="i-...">). */
export function Icone({ id, className = "h-5 w-5" }: { id: string; className?: string }) {
  return (
    <svg
      className={`${className} shrink-0 fill-none stroke-current`}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <use href={`#${id}`} />
    </svg>
  );
}
