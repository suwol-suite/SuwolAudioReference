import { Plus, X } from "lucide-react";
import { useState } from "react";
import type { AssetListItem } from "../../shared/library-types";
import { useI18n } from "../i18n/useI18n";

interface TagEditorProps {
  asset: AssetListItem;
  onRefresh: () => Promise<void>;
}

export function TagEditor({ asset, onRefresh }: TagEditorProps): JSX.Element {
  const { t } = useI18n();
  const [tagName, setTagName] = useState("");

  async function addTag(): Promise<void> {
    const name = tagName.trim();
    if (!name) {
      return;
    }
    await window.suwolAudio.tags.applyToAssets({ assetIds: [asset.id], tagNames: [name] });
    setTagName("");
    await onRefresh();
  }

  async function removeTag(tagId: string): Promise<void> {
    await window.suwolAudio.tags.removeFromAssets({ assetIds: [asset.id], tagIds: [tagId] });
    await onRefresh();
  }

  return (
    <div className="tag-editor">
      <div className="tag-pill-list">
        {asset.tags.length === 0 ? <span className="muted">{t("tag.empty")}</span> : null}
        {asset.tags.map((tag) => (
          <span className="tag-pill" key={tag.id}>
            <span className="tag-dot" style={{ background: tag.color }} />
            {tag.name}
            <button type="button" onClick={() => removeTag(tag.id)} title={t("tag.remove")} aria-label={t("tag.remove")}>
              <X size={12} aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>
      <div className="inline-form">
        <input
          value={tagName}
          placeholder={t("tag.add")}
          aria-label={t("tag.add")}
          onChange={(event) => setTagName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void addTag();
            }
          }}
        />
        <button className="icon-button" type="button" onClick={addTag} title={t("tag.add")} aria-label={t("tag.add")}>
          <Plus size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
