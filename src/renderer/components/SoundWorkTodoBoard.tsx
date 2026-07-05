import { AlertTriangle, Plus } from "lucide-react";
import type {
  SoundUsagePriority,
  SoundUsageStatus,
  SoundWorkTodoColumn,
  SoundWorkTodoItem,
  SoundWorkTodoSummary,
} from "../../shared/sound-board-types";
import type { MessageKey } from "../i18n/i18n";
import { useI18n } from "../i18n/useI18n";

const TODO_COLUMNS: SoundWorkTodoColumn[] = [
  "missing",
  "need_candidates",
  "reviewing",
  "selected",
  "approved",
  "deferred",
  "risk",
];
const STATUS_OPTIONS: SoundUsageStatus[] = ["missing", "needs_candidates", "reviewing", "selected", "approved", "rejected", "deferred"];
const PRIORITY_OPTIONS: SoundUsagePriority[] = ["low", "normal", "high", "critical"];

interface SoundWorkTodoBoardProps {
  summary: SoundWorkTodoSummary | null;
  items: SoundWorkTodoItem[];
  activeColumn: SoundWorkTodoColumn | "all";
  assigneeFilter: string;
  dueFilter: string;
  disabled: boolean;
  onColumnChange: (column: SoundWorkTodoColumn | "all") => void;
  onAssigneeFilterChange: (value: string) => void;
  onDueFilterChange: (value: string) => void;
  onSelectItem: (usageItemId: string) => void;
  onStatusChange: (usageItemId: string, status: SoundUsageStatus) => void;
  onPriorityChange: (usageItemId: string, priority: SoundUsagePriority) => void;
  onAddCandidate: (usageItemId: string) => void;
}

export function SoundWorkTodoBoard({
  summary,
  items,
  activeColumn,
  assigneeFilter,
  dueFilter,
  disabled,
  onColumnChange,
  onAssigneeFilterChange,
  onDueFilterChange,
  onSelectItem,
  onStatusChange,
  onPriorityChange,
  onAddCandidate,
}: SoundWorkTodoBoardProps): JSX.Element {
  const { t, format } = useI18n();
  return (
    <section className="sound-work-todo-board">
      <div className="sound-panel-header">
        <h3>{t("soundBoard.todo.title" as MessageKey)}</h3>
        <button className={activeColumn === "all" ? "secondary-button compact is-active" : "secondary-button compact"} type="button" onClick={() => onColumnChange("all")}>
          {t("common.all" as MessageKey)}
        </button>
      </div>
      <div className="todo-filter-row">
        <input value={assigneeFilter} placeholder={t("soundBoard.assignee" as MessageKey)} onChange={(event) => onAssigneeFilterChange(event.target.value)} />
        <input value={dueFilter} placeholder={t("soundBoard.dueLabel" as MessageKey)} onChange={(event) => onDueFilterChange(event.target.value)} />
      </div>
      <div className="todo-column-tabs">
        {TODO_COLUMNS.map((column) => (
          <button
            key={column}
            className={activeColumn === column ? "todo-column-tab is-active" : "todo-column-tab"}
            type="button"
            onClick={() => onColumnChange(column)}
          >
            <span>{t(`soundBoard.todo.${column}` as MessageKey)}</span>
            <strong>{format.number(summary?.columns[column] ?? 0)}</strong>
          </button>
        ))}
      </div>
      <div className="todo-task-list">
        {items.length === 0 ? <p className="muted">{t("soundBoard.todo.empty" as MessageKey)}</p> : null}
        {items.slice(0, 24).map((entry) => (
          <div
            key={entry.item.id}
            className="todo-task-card"
            role="button"
            tabIndex={0}
            onClick={() => onSelectItem(entry.item.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectItem(entry.item.id);
              }
            }}
          >
            <span>
              <strong>{entry.item.key}</strong>
              <small>{entry.item.displayName}</small>
            </span>
            <span className="todo-task-meta">
              <span className={`status-badge status-${entry.item.status}`}>{t(`soundBoard.status.${entry.item.status}` as MessageKey)}</span>
              <span className={`status-badge priority-${entry.item.priority}`}>{t(`soundBoard.priority.${entry.item.priority}` as MessageKey)}</span>
              {entry.riskCount > 0 ? (
                <span className="status-badge issue-warning">
                  <AlertTriangle size={12} aria-hidden="true" />
                  {format.number(entry.riskCount)}
                </span>
              ) : null}
            </span>
            <span className="todo-task-meta">
              <small>{entry.item.assignee || "-"}</small>
              <small>{entry.item.dueLabel || "-"}</small>
              <small>{entry.selectedAssetName || t("soundBoard.noSelectedAsset" as MessageKey)}</small>
            </span>
            <span className="todo-task-actions" onClick={(event) => event.stopPropagation()}>
              <select value={entry.item.status} disabled={disabled} onChange={(event) => onStatusChange(entry.item.id, event.target.value as SoundUsageStatus)}>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>{t(`soundBoard.status.${status}` as MessageKey)}</option>
                ))}
              </select>
              <select value={entry.item.priority} disabled={disabled} onChange={(event) => onPriorityChange(entry.item.id, event.target.value as SoundUsagePriority)}>
                {PRIORITY_OPTIONS.map((priority) => (
                  <option key={priority} value={priority}>{t(`soundBoard.priority.${priority}` as MessageKey)}</option>
                ))}
              </select>
              <button className="icon-button" type="button" disabled={disabled} onClick={() => onAddCandidate(entry.item.id)} title={t("soundBoard.addSelectedAsset" as MessageKey)} aria-label={t("soundBoard.addSelectedAsset" as MessageKey)}>
                <Plus size={13} aria-hidden="true" />
              </button>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
