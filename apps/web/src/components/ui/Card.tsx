import type { HTMLAttributes, ReactNode } from "react";

export function Card({ className = "", children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rounded-2xl border border-border bg-surface shadow-soft ${className}`} {...props}>
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
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <div className="mt-3 flex items-center gap-3">
        {icon && (
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${ICON_TONE_CLASSES[tone]}`}>
            {icon}
          </span>
        )}
        <p className="font-display text-2xl font-extrabold tabular text-ink">{value}</p>
      </div>
      {hint && <p className="mt-1.5 text-xs text-ink-muted">{hint}</p>}
    </Card>
  );
}
