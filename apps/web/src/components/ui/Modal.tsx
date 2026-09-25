import { useEffect, type ReactNode } from "react";
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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-slate-950/40 px-4 py-8 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-full w-full ${maxWidthClassName} animate-modal-in flex-col rounded-2xl border border-border bg-surface shadow-lift`}
      >
        <div className="flex items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-3">
            {icon && (
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-petrol/10 text-petrol">{icon}</span>
            )}
            <h2 className="text-lg font-semibold text-ink">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-ink/5 hover:text-ink"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {tabs && <div className="flex gap-6 border-b border-border px-6">{tabs}</div>}

        <div className="flex-1 overflow-y-auto border-t border-border px-6 py-5">{children}</div>

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
      className={`-mb-px border-b-2 px-1 py-3 text-sm font-medium ${
        active ? "border-petrol text-petrol" : "border-transparent text-ink-muted hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}
