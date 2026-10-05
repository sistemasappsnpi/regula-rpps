import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost" | "danger";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-petrol text-on-petrol shadow-soft ring-1 ring-inset ring-white/10 hover:brightness-125 hover:shadow-lift active:brightness-100",
  ghost: "border border-border bg-surface text-ink shadow-soft hover:border-petrol/30 hover:bg-petrol/[0.04]",
  danger: "bg-crit text-white shadow-soft hover:brightness-110 hover:shadow-lift active:brightness-95",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
