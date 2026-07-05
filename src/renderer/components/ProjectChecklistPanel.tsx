import { Plus, X } from "lucide-react";
import type {
  SoundProjectChecklistItemRecord,
  SoundProjectChecklistItemUpdateInput,
  SoundProjectChecklistListResult,
} from "../../shared/sound-board-types";
import type { MessageKey } from "../i18n/i18n";
import { useI18n } from "../i18n/useI18n";

interface ProjectChecklistPanelProps {
  checklist: SoundProjectChecklistListResult | null;
  disabled: boolean;
  onAddBuiltins: () => void;
  onCreateCustom: (label: string) => void;
  onUpdate: (itemId: string, input: SoundProjectChecklistItemUpdateInput) => void;
  onDelete: (itemId: string) => void;
}

export function ProjectChecklistPanel({
  checklist,
  disabled,
  onAddBuiltins,
  onCreateCustom,
  onUpdate,
  onDelete,
}: ProjectChecklistPanelProps): JSX.Element | null {
  const { t } = useI18n();
  if (!checklist) {
    return null;
  }
  return (
    <section className="sound-detail-section project-checklist-panel">
      <div className="sound-panel-header">
        <h3>{t("soundBoard.checklist.title" as MessageKey)}</h3>
        <button className="secondary-button compact" type="button" disabled={disabled} onClick={onAddBuiltins}>
          <Plus size={14} aria-hidden="true" />
          {t("soundBoard.checklist.addBuiltins" as MessageKey)}
        </button>
        <button
          className="secondary-button compact"
          type="button"
          disabled={disabled}
          onClick={() => {
            const label = window.prompt(t("soundBoard.checklist.customPrompt" as MessageKey));
            if (label?.trim()) {
              onCreateCustom(label);
            }
          }}
        >
          <Plus size={14} aria-hidden="true" />
          {t("soundBoard.checklist.addCustom" as MessageKey)}
        </button>
      </div>
      <div className="checklist-list">
        {checklist.items.length === 0 ? <p className="muted">{t("soundBoard.checklist.empty" as MessageKey)}</p> : null}
        {checklist.items.map((item) => (
          <ChecklistRow key={item.id} item={item} disabled={disabled} onUpdate={onUpdate} onDelete={onDelete} />
        ))}
      </div>
    </section>
  );
}

function ChecklistRow({
  item,
  disabled,
  onUpdate,
  onDelete,
}: {
  item: SoundProjectChecklistItemRecord;
  disabled: boolean;
  onUpdate: (itemId: string, input: SoundProjectChecklistItemUpdateInput) => void;
  onDelete: (itemId: string) => void;
}): JSX.Element {
  const { t } = useI18n();
  return (
    <div className="checklist-row">
      <label className="toggle-chip">
        <input type="checkbox" checked={item.checked} disabled={disabled} onChange={(event) => onUpdate(item.id, { checked: event.target.checked })} />
        {item.label}
      </label>
      <input
        value={item.note}
        placeholder={t("soundBoard.checklist.note" as MessageKey)}
        disabled={disabled}
        onChange={(event) => onUpdate(item.id, { note: event.target.value })}
      />
      <button className="icon-button" type="button" disabled={disabled} onClick={() => onDelete(item.id)} title={t("common.delete")} aria-label={t("common.delete")}>
        <X size={13} aria-hidden="true" />
      </button>
    </div>
  );
}
