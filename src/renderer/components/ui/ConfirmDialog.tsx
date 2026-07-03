import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useI18n } from "../../i18n/useI18n";

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }): JSX.Element {
  const { t } = useI18n();
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...options, resolve });
    });
  }, []);

  const value = useMemo(() => confirm, [confirm]);

  function close(result: boolean): void {
    pending?.resolve(result);
    setPending(null);
  }

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {pending ? (
        <div className="settings-backdrop" role="presentation" onMouseDown={() => close(false)}>
          <section
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-label={pending.title}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <h2>
                <AlertTriangle size={18} aria-hidden="true" />
                {pending.title}
              </h2>
              <button className="icon-button" type="button" onClick={() => close(false)} title={t("common.close")} aria-label={t("common.close")}>
                <X size={16} aria-hidden="true" />
              </button>
            </header>
            <p>{pending.message}</p>
            <footer>
              <button className="secondary-button compact" type="button" onClick={() => close(false)}>
                {pending.cancelLabel ?? t("common.cancel")}
              </button>
              <button className={pending.danger ? "danger-button compact" : "primary-button compact"} type="button" onClick={() => close(true)}>
                {pending.confirmLabel ?? t("common.apply")}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  const context = useContext(ConfirmContext);
  return context ?? (async () => false);
}
