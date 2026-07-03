import { ArchiveRestore, FileOutput, Heart, MoreHorizontal, Star, Tags, Trash2 } from "lucide-react";
import { useState } from "react";
import type { CollectionRecord, TagRecord } from "../../shared/library-types";
import { useI18n } from "../i18n/useI18n";
import { useConfirm } from "./ui/ConfirmDialog";
import { useToast } from "./ui/ToastProvider";

interface BatchActionBarProps {
  selectedAssetIds: string[];
  tags: TagRecord[];
  collections: CollectionRecord[];
  onlyTrashed: boolean;
  onExport: () => void;
  onDone: () => Promise<void>;
}

export function BatchActionBar({
  selectedAssetIds,
  tags,
  collections,
  onlyTrashed,
  onExport,
  onDone,
}: BatchActionBarProps): JSX.Element | null {
  const { t, format } = useI18n();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [tagName, setTagName] = useState("");
  const [removeTagId, setRemoveTagId] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (selectedAssetIds.length === 0) {
    return null;
  }

  async function run(label: string, action: () => Promise<{ success: number; failed: number; skipped: number }>): Promise<void> {
    const result = await action();
    setMessage(t("batch.complete", {
      label,
      success: format.number(result.success),
      failed: format.number(result.failed),
      skipped: format.number(result.skipped),
    }));
    showToast(result.failed > 0 ? "warning" : "success", label);
    await onDone();
  }

  return (
    <div className="batch-action-bar">
      <strong>{t("batch.selected", { count: format.number(selectedAssetIds.length) })}</strong>
      <button className="secondary-button compact" type="button" onClick={onExport}>
        <FileOutput size={14} aria-hidden="true" />
        {t("export.title")}
      </button>
      <div className="inline-form">
        <input value={tagName} placeholder={t("tag.placeholder")} aria-label={t("tag.placeholder")} onChange={(event) => setTagName(event.target.value)} />
        <button
          className="secondary-button compact"
          type="button"
          onClick={() =>
            run(t("batch.addTag"), () =>
              window.suwolAudio.tags.applyToAssets({ assetIds: selectedAssetIds, tagNames: [tagName] }),
            )
          }
        >
          <Tags size={14} aria-hidden="true" />
          {t("common.add")}
        </button>
      </div>

      <select value={collectionId} onChange={(event) => setCollectionId(event.target.value)}>
        <option value="">{t("collection.title")}</option>
        {collections.map((collection) => (
          <option key={collection.id} value={collection.id}>
            {collection.name}
          </option>
        ))}
      </select>
      <button
        className="secondary-button compact"
        type="button"
        disabled={!collectionId}
        onClick={() =>
          run(t("batch.addToCollection"), () =>
            window.suwolAudio.collections.addAssets({ collectionId, assetIds: selectedAssetIds }),
          )
        }
      >
        {t("common.add")}
      </button>

      <button
        className="secondary-button compact"
        type="button"
        onClick={() =>
          run(t("batch.favoriteOn"), async () => {
            let success = 0;
            let failed = 0;
            for (const assetId of selectedAssetIds) {
              try {
                await window.suwolAudio.assets.update(assetId, { favorite: true });
                success += 1;
              } catch {
                failed += 1;
              }
            }
            return { success, failed, skipped: 0 };
          })
        }
        title={t("batch.favoriteOn")}
      >
        <Heart size={14} aria-hidden="true" />
        {t("asset.favorite")}
      </button>

      <button className="icon-button" type="button" onClick={() => setAdvancedOpen((value) => !value)} title={t("batch.more")} aria-label={t("batch.more")}>
        <MoreHorizontal size={15} aria-hidden="true" />
      </button>

      {onlyTrashed ? (
        <>
          <button
            className="secondary-button compact"
            type="button"
            onClick={() => run(t("trash.restore"), () => window.suwolAudio.assets.restore(selectedAssetIds))}
          >
            <ArchiveRestore size={14} aria-hidden="true" />
            {t("trash.restore")}
          </button>
          <button
            className="danger-button compact"
            type="button"
            onClick={async () => {
              if (
                await confirm({
                  title: t("trash.permanentDelete"),
                  message: t("trash.confirmPermanentDelete"),
                  confirmLabel: t("trash.permanentDelete"),
                  danger: true,
                })
              ) {
                void run(t("trash.permanentDelete"), () => window.suwolAudio.assets.deletePermanent(selectedAssetIds));
              }
            }}
          >
            <Trash2 size={14} aria-hidden="true" />
            {t("trash.permanentDelete")}
          </button>
        </>
      ) : (
        <button
          className="danger-button compact"
          type="button"
          onClick={async () => {
            if (
              await confirm({
                title: t("trash.title"),
                message: t("trash.confirmMove"),
                confirmLabel: t("trash.move"),
                danger: true,
              })
            ) {
              void run(t("trash.move"), () => window.suwolAudio.assets.trash(selectedAssetIds));
            }
          }}
        >
          <Trash2 size={14} aria-hidden="true" />
          {t("trash.title")}
        </button>
      )}

      {advancedOpen ? (
        <div className="batch-more-panel">
          <select value={removeTagId} onChange={(event) => setRemoveTagId(event.target.value)}>
            <option value="">{t("tag.removeSelect")}</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
          <button
            className="secondary-button compact"
            type="button"
            disabled={!removeTagId}
            onClick={() =>
              run(t("batch.removeTag"), () =>
                window.suwolAudio.tags.removeFromAssets({ assetIds: selectedAssetIds, tagIds: [removeTagId] }),
              )
            }
          >
            {t("common.remove")}
          </button>
          {[1, 3, 5].map((rating) => (
            <button
              className="icon-button"
              key={rating}
              type="button"
              onClick={() =>
                run(`${t("batch.setRating")} ${rating}`, async () => {
                  let success = 0;
                  let failed = 0;
                  for (const assetId of selectedAssetIds) {
                    try {
                      await window.suwolAudio.assets.update(assetId, { rating });
                      success += 1;
                    } catch {
                      failed += 1;
                    }
                  }
                  return { success, failed, skipped: 0 };
                })
              }
              title={`${t("asset.rating")} ${rating}`}
            >
              <Star size={14} aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : null}

      {message ? <span className="batch-message">{message}</span> : null}
    </div>
  );
}
