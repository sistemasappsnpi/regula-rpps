import type { ReactNode } from "react";

type Tone = "ok" | "warn" | "crit" | "neutral";

const TONE_CLASSES: Record<Tone, string> = {
  ok: "bg-ok/15 text-ok border-ok/30",
  warn: "bg-warn/15 text-warn border-warn/30",
  crit: "bg-crit/15 text-crit border-crit/30",
  neutral: "bg-ink-muted/10 text-ink-muted border-ink-muted/25",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

export function statusTone(status: "REGULAR" | "IRREGULAR" | "PENDENTE"): Tone {
  if (status === "REGULAR") return "ok";
  if (status === "IRREGULAR") return "crit";
  return "warn";
}

export function statusLabel(status: "REGULAR" | "IRREGULAR" | "PENDENTE"): string {
  if (status === "REGULAR") return "Regular";
  if (status === "IRREGULAR") return "Irregular";
  return "Pendente";
}
