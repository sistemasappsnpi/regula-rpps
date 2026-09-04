import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-soft hover:brightness-110 active:brightness-95",
  ghost: "bg-surface text-ink hover:bg-ink/5 border border-border shadow-soft",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-petrol disabled:opacity-50 disabled:shadow-none ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
