import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-gold text-white hover:brightness-95",
  ghost: "bg-transparent text-ink hover:bg-ink/5 border border-border",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-petrol disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
