import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal } from "./Modal";
import { Button } from "./Button";

// Substitui window.confirm por um modal consistente com o resto do sistema. Uso: const confirmar
// = useConfirm(); depois `if (!(await confirmar("Excluir X?"))) return;` — mesma forma de uso do
// window.confirm original, só que assíncrona.
interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
}

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pedido, setPedido] = useState<{ options: ConfirmOptions; resolve: (valor: boolean) => void } | null>(null);

  const confirmar = useCallback<ConfirmFn>((options) => {
    const normalizado = typeof options === "string" ? { message: options } : options;
    return new Promise<boolean>((resolve) => setPedido({ options: normalizado, resolve }));
  }, []);

  function responder(valor: boolean) {
    pedido?.resolve(valor);
    setPedido(null);
  }

  const opts = pedido?.options;
  const perigoso = opts?.tone === "danger";

  return (
    <ConfirmContext.Provider value={confirmar}>
      {children}
      {opts && (
        <Modal
          open
          onClose={() => responder(false)}
          title={opts.title ?? (perigoso ? "Confirmar exclusão" : "Confirmar ação")}
          icon={<AlertTriangle size={17} />}
          maxWidthClassName="max-w-sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => responder(false)}>
                {opts.cancelLabel ?? "Cancelar"}
              </Button>
              <Button variant={perigoso ? "danger" : "primary"} onClick={() => responder(true)}>
                {opts.confirmLabel ?? "Confirmar"}
              </Button>
            </>
          }
        >
          <p className="text-sm text-ink">{opts.message}</p>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm precisa ser usado dentro de <ConfirmProvider>.");
  return ctx;
}
