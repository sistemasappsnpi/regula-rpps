import type { ReactNode } from "react";
import { X } from "lucide-react";

export function Modal({
  open,
  onClose,
  title,
  icon,
  tabs,
  footer,
  children,
  maxWidthClassName = "max-w-2xl",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: ReactNode;
  tabs?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  maxWidthClassName?: string;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8">
      <div className={`flex max-h-full w-full ${maxWidthClassName} flex-col rounded-2xl bg-surface shadow-soft`}>
        <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-4">
          <div className="flex items-center gap-2.5">
            {icon && (
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-petrol/10 text-petrol">
                {icon}
              </span>
            )}
            <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
          </div>
          <button onClick={onClose} className="text-ink-muted transition-colors hover:text-ink" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        {tabs && <div className="flex gap-5 border-b border-border px-6">{tabs}</div>}

        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && <div className="flex justify-end gap-2 border-t border-border px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function ModalTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
        active ? "border-petrol text-petrol" : "border-transparent text-ink-muted hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}
