import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useI18n } from "../../i18n/useI18n";

export type ToastKind = "success" | "info" | "warning" | "error";

interface ToastRecord {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  showToast: (kind: ToastKind, message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const { t } = useI18n();
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  const showToast = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, kind, message }].slice(-4));
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, kind === "error" ? 5200 : 3600);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div className={`toast toast-${toast.kind}`} key={toast.id}>
            {iconForKind(toast.kind)}
            <span>{toast.message}</span>
            <button
              className="mini-icon-button"
              type="button"
              onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
              aria-label={t("common.dismiss")}
              title={t("common.dismiss")}
            >
              <X size={13} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      showToast: () => {
        // Components remain usable in isolated tests without the provider.
      },
    };
  }
  return context;
}

function iconForKind(kind: ToastKind): JSX.Element {
  if (kind === "success") {
    return <CheckCircle2 size={16} aria-hidden="true" />;
  }
  if (kind === "warning") {
    return <AlertTriangle size={16} aria-hidden="true" />;
  }
  if (kind === "error") {
    return <XCircle size={16} aria-hidden="true" />;
  }
  return <Info size={16} aria-hidden="true" />;
}
