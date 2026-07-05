import { Link2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AssetListItem } from "../../shared/library-types";
import type { GameProjectRecord, SoundUsageItemRecord } from "../../shared/sound-board-types";
import type { MessageKey } from "../i18n/i18n";
import { useI18n } from "../i18n/useI18n";

interface AddToUsageDialogProps {
  open: boolean;
  asset: AssetListItem | null;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}

export function AddToUsageDialog({ open, asset, onClose, onDone }: AddToUsageDialogProps): JSX.Element | null {
  const { t } = useI18n();
  const [projects, setProjects] = useState<GameProjectRecord[]>([]);
  const [projectId, setProjectId] = useState("");
  const [items, setItems] = useState<SoundUsageItemRecord[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    void loadProjects();
  }, [open]);

  useEffect(() => {
    if (!projectId) {
      setItems([]);
      return;
    }
    void loadItems(projectId);
  }, [projectId, search]);

  const sortedItems = useMemo(() => {
    if (!asset) {
      return items;
    }
    const assetCategory = inferAssetCategory(asset);
    return [...items].sort((left, right) => {
      const leftScore = usageScore(left, assetCategory);
      const rightScore = usageScore(right, assetCategory);
      return rightScore - leftScore || left.key.localeCompare(right.key);
    });
  }, [asset, items]);

  if (!open || !asset) {
    return null;
  }

  async function loadProjects(): Promise<void> {
    const nextProjects = await window.suwolAudio.projects.list();
    setProjects(nextProjects);
    setProjectId((current) => current || nextProjects[0]?.id || "");
  }

  async function loadItems(nextProjectId: string): Promise<void> {
    setItems(await window.suwolAudio.usage.list({ projectId: nextProjectId, search, sort: "riskCount" }));
  }

  async function addToUsage(usageItemId: string): Promise<void> {
    if (!asset) {
      return;
    }
    setBusy(true);
    try {
      await window.suwolAudio.usageCandidates.add({ usageItemId, assetId: asset.id });
      await onDone();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="settings-dialog add-to-usage-dialog" role="dialog" aria-modal="true" aria-label={t("soundBoard.addToUsage" as MessageKey)} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <h2>
            <Link2 size={18} aria-hidden="true" />
            {t("soundBoard.addToUsage" as MessageKey)}
          </h2>
          <button className="icon-button" type="button" onClick={onClose} title={t("common.close")} aria-label={t("common.close")}>
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <p className="muted">{asset.title || asset.fileName}</p>
        <div className="sound-export-actions">
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            {projects.length === 0 ? <option value="">{t("soundBoard.noProjects" as MessageKey)}</option> : null}
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
          <input value={search} placeholder={t("soundBoard.searchUsage" as MessageKey)} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <div className="candidate-list">
          {projects.length === 0 ? <p className="muted">{t("soundBoard.createProjectFirst" as MessageKey)}</p> : null}
          {projects.length > 0 && sortedItems.length === 0 ? <p className="muted">{t("soundBoard.noFilterResults" as MessageKey)}</p> : null}
          {sortedItems.map((item) => (
            <button key={item.id} className="candidate-pick-row" type="button" disabled={busy} onClick={() => void addToUsage(item.id)}>
              <span>{item.key} - {item.displayName}</span>
              <small>
                {t(`soundBoard.category.${item.category}` as MessageKey)} / {t(`soundBoard.status.${item.status}` as MessageKey)} / {item.candidateCount}
              </small>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function inferAssetCategory(asset: AssetListItem): string {
  const primary = asset.audioAnalysis?.classification[0]?.type;
  if (primary === "ui_sound") {
    return "ui";
  }
  if (primary === "music") {
    return "bgm";
  }
  return primary ?? "";
}

function usageScore(item: SoundUsageItemRecord, assetCategory: string): number {
  return [
    item.category === assetCategory,
    item.selectedCandidateCount === 0,
    item.required,
    item.candidateCount === 0,
  ].filter(Boolean).length;
}
