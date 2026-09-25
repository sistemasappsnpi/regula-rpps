import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost" | "danger";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-petrol text-on-petrol shadow-soft hover:brightness-110 hover:shadow-lift active:brightness-95",
  ghost: "border border-border bg-surface text-ink shadow-soft hover:border-ink-muted/40 hover:bg-ink/[0.04]",
  danger: "bg-crit text-white shadow-soft hover:brightness-110 hover:shadow-lift active:brightness-95",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
