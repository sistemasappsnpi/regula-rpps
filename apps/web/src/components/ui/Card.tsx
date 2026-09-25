import type { HTMLAttributes, ReactNode } from "react";

// `interactive`: pra cards clicáveis — sobe de leve e ganha sombra no hover, dando retorno ao clique.
export function Card({
  className = "",
  children,
  interactive = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={`rounded-2xl border border-border bg-surface shadow-soft ${
        interactive ? "cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift" : ""
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

type IconTone = "petrol" | "gold" | "ok" | "warn" | "crit";

const ICON_TONE_CLASSES: Record<IconTone, string> = {
  petrol: "bg-petrol/10 text-petrol",
  gold: "bg-gold/10 text-gold",
  ok: "bg-ok/10 text-ok",
  warn: "bg-warn/10 text-warn",
  crit: "bg-crit/10 text-crit",
};

export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = "petrol",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: IconTone;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-ink-muted">{label}</p>
        {icon && (
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ICON_TONE_CLASSES[tone]}`}>
            {icon}
          </span>
        )}
      </div>
      <p className="mt-2 text-3xl font-bold tabular tracking-tight text-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </Card>
  );
}
