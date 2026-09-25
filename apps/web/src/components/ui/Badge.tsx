import type { ReactNode } from "react";

type Tone = "ok" | "warn" | "crit" | "neutral";

const TONE_CLASSES: Record<Tone, string> = {
  ok: "bg-ok/10 text-ok",
  warn: "bg-warn/10 text-warn",
  crit: "bg-crit/10 text-crit",
  neutral: "bg-ink-muted/10 text-ink-muted",
};

const DOT_CLASSES: Record<Tone, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  crit: "bg-crit",
  neutral: "bg-ink-muted",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${TONE_CLASSES[tone]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASSES[tone]}`} />
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
