import { X } from "lucide-react";
import { useEffect } from "react";
import type { MessageKey } from "../i18n/i18n";
import { useI18n } from "../i18n/useI18n";

interface ShortcutHelpDialogProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS: Array<{ combo: string; labelKey: MessageKey }> = [
  { combo: "ArrowUp / ArrowDown", labelKey: "shortcuts.navigate" },
  { combo: "ArrowLeft / ArrowRight", labelKey: "shortcuts.navigateGrid" },
  { combo: "Enter", labelKey: "shortcuts.playSelected" },
  { combo: "Space", labelKey: "shortcuts.togglePlayback" },
  { combo: "Esc", labelKey: "shortcuts.stopOrClear" },
  { combo: "F", labelKey: "shortcuts.favorite" },
  { combo: "1-5 / 0", labelKey: "shortcuts.rating" },
  { combo: "L / A / B", labelKey: "shortcuts.loop" },
  { combo: "Ctrl+A / Cmd+A", labelKey: "shortcuts.selectAll" },
  { combo: "Delete", labelKey: "shortcuts.trash" },
  { combo: "Ctrl+F / Cmd+F", labelKey: "shortcuts.focusSearch" },
  { combo: "?", labelKey: "shortcuts.help" },
];

export function ShortcutHelpDialog({ open, onClose }: ShortcutHelpDialogProps): JSX.Element | null {
  const { t } = useI18n();

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="settings-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="settings-dialog shortcut-dialog" role="dialog" aria-modal="true" aria-label={t("shortcuts.title")} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <h2>{t("shortcuts.title")}</h2>
          <button className="icon-button" type="button" onClick={onClose} title={t("common.close")} aria-label={t("common.close")}>
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <dl className="shortcut-grid shortcut-help-grid">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.combo}>
              <dt>{shortcut.combo}</dt>
              <dd>{t(shortcut.labelKey)}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
