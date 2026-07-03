import { FileOutput, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  CodexInstructionTemplate,
  ExportOptions,
  ExportPresetRecord,
  ExportPreview,
  ExportRunResult,
  ExportSource,
  ExportTargetType,
  ManifestPreviewInput,
} from "../../shared/export-types";
import type { AssetListQuery, CollectionRecord, SmartFolderId, TagRecord } from "../../shared/library-types";
import type { MessageKey } from "../i18n/i18n";
import { useI18n } from "../i18n/useI18n";
import { ExportPresetSelector } from "./ExportPresetSelector";
import { ExportPreviewPanel } from "./ExportPreviewPanel";

interface ExportCenterDialogProps {
  open: boolean;
  selectedAssetIds: string[];
  currentQuery: AssetListQuery;
  tags: TagRecord[];
  collections: CollectionRecord[];
  onClose: () => void;
}

const TARGET_OPTIONS: ExportTargetType[] = [
  "codex_markdown",
  "codex_json",
  "generic_manifest",
  "unity_manifest",
  "unreal_json",
  "unreal_csv",
  "monogame_manifest",
  "monogame_content",
  "sound_pack_metadata",
  "sound_pack_folder",
  "csv_report",
];

const TEMPLATE_OPTIONS: CodexInstructionTemplate[] = [
  "unity_import_plan",
  "unreal_import_plan",
  "monogame_import_plan",
  "generic_game_audio_manifest",
  "rename_plan",
  "tag_cleanup_plan",
  "sound_usage_map",
  "audio_replacement_candidates",
  "custom_instruction",
];

const SMART_FOLDER_OPTIONS: SmartFolderId[] = [
  "all",
  "favorites",
  "recentImports",
  "recentPlayed",
  "shortSounds",
  "longBeds",
  "uiCandidates",
  "sfxCandidates",
  "musicCandidates",
  "voiceCandidates",
  "ambienceCandidates",
  "loopCandidates",
  "similarCandidates",
  "highLoopCandidates",
  "silenceStart",
  "silenceEnd",
  "highPeak",
  "highRms",
  "featureMissing",
  "needsReanalysis",
  "duplicateCandidates",
];

export function ExportCenterDialog({
  open,
  selectedAssetIds,
  currentQuery,
  tags,
  collections,
  onClose,
}: ExportCenterDialogProps): JSX.Element | null {
  const { t } = useI18n();
  const [options, setOptions] = useState<ExportOptions>(() => createDefaultOptions(selectedAssetIds, currentQuery));
  const [presets, setPresets] = useState<ExportPresetRecord[]>([]);
  const [preview, setPreview] = useState<ExportPreview | null>(null);
  const [previewText, setPreviewText] = useState("");
  const [result, setResult] = useState<ExportRunResult | null>(null);
  const [warningsAcknowledged, setWarningsAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);

  const sourceKind = options.source.type;
  const selectedCollectionId = options.source.type === "collection" ? options.source.collectionId : "";
  const selectedTagId = options.source.type === "tag" ? options.source.tagId : "";
  const selectedSmartFolder = options.source.type === "smartFolder" ? options.source.smartFolder : "all";
  const isCodexTarget = options.target === "codex_markdown" || options.target === "codex_json";
  const isManifestTarget = !isCodexTarget && options.target !== "sound_pack_folder" && options.target !== "sound_pack_metadata" && options.target !== "csv_report";

  const currentConfig = useMemo(() => options, [options]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setOptions((current) => ({
      ...current,
      source: selectedAssetIds.length > 0 ? { type: "selected", assetIds: selectedAssetIds } : { type: "query", query: currentQuery, label: t("export.currentFilter") },
    }));
    setPreview(null);
    setPreviewText("");
    setResult(null);
    setWarningsAcknowledged(false);
    void refreshPresets();
  }, [open, selectedAssetIds.join("|")]);

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

  async function refreshPresets(): Promise<void> {
    setPresets(await window.suwolAudio.export.presetsList());
  }

  function updateOptions(input: Partial<ExportOptions>): void {
    setOptions((current) => ({ ...current, ...input }));
    setPreview(null);
    setPreviewText("");
    setResult(null);
    setWarningsAcknowledged(false);
  }

  function updateSource(source: ExportSource): void {
    updateOptions({ source });
  }

  function applyPreset(config: Partial<ExportOptions>): void {
    setOptions((current) => ({ ...current, ...config, source: config.source ?? current.source }));
    setPreview(null);
    setPreviewText("");
    setResult(null);
  }

  async function refreshPreview(): Promise<void> {
    setBusy(true);
    setResult(null);
    try {
      const nextPreview = await window.suwolAudio.export.preview(options);
      setPreview(nextPreview);
      if (isCodexTarget) {
        setPreviewText(
          await window.suwolAudio.codex.previewInstruction({
            source: options.source,
            goal: options.codexGoal,
            template: options.codexTemplate,
            includeAbsolutePaths: options.includeAbsolutePaths,
            includeRights: options.includeRights,
          }),
        );
      } else if (isManifestTarget) {
        setPreviewText(
          await window.suwolAudio.manifest.preview({
            source: options.source,
            target: options.target as ManifestPreviewInput["target"],
            includeAbsolutePaths: options.includeAbsolutePaths,
            includeRights: options.includeRights,
          }),
        );
      } else {
        setPreviewText("");
      }
    } finally {
      setBusy(false);
    }
  }

  async function runExport(): Promise<void> {
    setBusy(true);
    try {
      const nextResult = await window.suwolAudio.export.run({
        ...options,
        acknowledgeWarnings: warningsAcknowledged,
      });
      if (nextResult) {
        setResult(nextResult);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="settings-dialog export-dialog" role="dialog" aria-modal="true" aria-label={t("export.title")} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <h2>
            <FileOutput size={18} aria-hidden="true" />
            {t("export.title")}
          </h2>
          <button className="icon-button" type="button" onClick={onClose} title={t("common.close")} aria-label={t("common.close")}>
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="export-layout">
          <div className="export-column">
            <section className="export-section">
              <h3>{t("export.source")}</h3>
              <select
                value={sourceKind}
                onChange={(event) => {
                  const next = event.target.value as ExportSource["type"];
                  if (next === "selected") {
                    updateSource({ type: "selected", assetIds: selectedAssetIds });
                  } else if (next === "query") {
                    updateSource({ type: "query", query: currentQuery, label: t("export.currentFilter") });
                  } else if (next === "collection") {
                    updateSource({ type: "collection", collectionId: collections[0]?.id ?? "", name: collections[0]?.name });
                  } else if (next === "tag") {
                    updateSource({ type: "tag", tagId: tags[0]?.id ?? "", name: tags[0]?.name });
                  } else if (next === "smartFolder") {
                    updateSource({ type: "smartFolder", smartFolder: "all", name: t("asset.all") });
                  } else {
                    updateSource({ type: "library" });
                  }
                }}
              >
                <option value="selected" disabled={selectedAssetIds.length === 0}>
                  {t("export.source.selected")}
                </option>
                <option value="query">{t("export.source.query")}</option>
                <option value="collection">{t("export.source.collection")}</option>
                <option value="tag">{t("export.source.tag")}</option>
                <option value="smartFolder">{t("export.source.smartFolder")}</option>
                <option value="library">{t("export.source.library")}</option>
              </select>

              {sourceKind === "collection" ? (
                <select
                  value={selectedCollectionId}
                  onChange={(event) => {
                    const collection = collections.find((item) => item.id === event.target.value);
                    updateSource({ type: "collection", collectionId: event.target.value, name: collection?.name });
                  }}
                >
                  {collections.map((collection) => (
                    <option key={collection.id} value={collection.id}>
                      {collection.name}
                    </option>
                  ))}
                </select>
              ) : null}

              {sourceKind === "tag" ? (
                <select
                  value={selectedTagId}
                  onChange={(event) => {
                    const tag = tags.find((item) => item.id === event.target.value);
                    updateSource({ type: "tag", tagId: event.target.value, name: tag?.name });
                  }}
                >
                  {tags.map((tag) => (
                    <option key={tag.id} value={tag.id}>
                      {tag.name}
                    </option>
                  ))}
                </select>
              ) : null}

              {sourceKind === "smartFolder" ? (
                <select
                  value={selectedSmartFolder}
                  onChange={(event) =>
                    updateSource({
                      type: "smartFolder",
                      smartFolder: event.target.value as SmartFolderId,
                      name:
                        event.target.value === "all"
                          ? t("asset.all")
                          : t(`smartFolder.${event.target.value}` as MessageKey),
                    })
                  }
                >
                  {SMART_FOLDER_OPTIONS.map((folder) => (
                    <option key={folder} value={folder}>
                      {folder === "all" ? t("asset.all") : t(`smartFolder.${folder}` as MessageKey)}
                    </option>
                  ))}
                </select>
              ) : null}
            </section>

            <section className="export-section">
              <h3>{t("export.target")}</h3>
              <select value={options.target} onChange={(event) => updateOptions({ target: event.target.value as ExportTargetType })}>
                {TARGET_OPTIONS.map((target) => (
                  <option key={target} value={target}>
                    {t(`export.target.${target}` as MessageKey)}
                  </option>
                ))}
              </select>
              <p className="muted">{t(`export.targetDescription.${options.target}` as MessageKey)}</p>
              {isCodexTarget ? (
                <>
                  <textarea
                    value={options.codexGoal}
                    rows={4}
                    placeholder={t("export.codexGoal")}
                    onChange={(event) => updateOptions({ codexGoal: event.target.value })}
                  />
                  <select value={options.codexTemplate} onChange={(event) => updateOptions({ codexTemplate: event.target.value as CodexInstructionTemplate })}>
                    {TEMPLATE_OPTIONS.map((template) => (
                      <option key={template} value={template}>
                        {t(`export.template.${template}` as MessageKey)}
                      </option>
                    ))}
                  </select>
                </>
              ) : null}
              {options.target === "sound_pack_folder" ? (
                <input
                  value={options.soundPackName}
                  placeholder={t("export.soundPackName")}
                  onChange={(event) => updateOptions({ soundPackName: event.target.value })}
                />
              ) : null}
            </section>

            <section className="export-section">
              <h3>{t("export.options")}</h3>
              <label className="settings-toggle">
                <input type="checkbox" checked={options.includeTrashed} onChange={(event) => updateOptions({ includeTrashed: event.target.checked })} />
                {t("export.includeTrashed")}
              </label>
              <label className="settings-toggle">
                <input type="checkbox" checked={options.includeRights} onChange={(event) => updateOptions({ includeRights: event.target.checked })} />
                {t("export.includeRights")}
              </label>
              <label className="settings-toggle">
                <input type="checkbox" checked={options.includeAbsolutePaths} onChange={(event) => updateOptions({ includeAbsolutePaths: event.target.checked })} />
                {t("export.includeAbsolutePaths")}
              </label>
              <label className="settings-toggle">
                <input type="checkbox" checked={options.useSafeFilenames} onChange={(event) => updateOptions({ useSafeFilenames: event.target.checked })} />
                {t("export.safeFilenames")}
              </label>
              <label className="settings-row">
                {t("export.groupBy")}
                <select value={options.groupBy} onChange={(event) => updateOptions({ groupBy: event.target.value as ExportOptions["groupBy"] })}>
                  <option value="category">{t("export.group.category")}</option>
                  <option value="tag">{t("export.group.tag")}</option>
                  <option value="none">{t("export.group.none")}</option>
                </select>
              </label>
              {options.target === "sound_pack_folder" ? (
                <label className="settings-toggle">
                  <input type="checkbox" checked={options.copyAudioFiles} onChange={(event) => updateOptions({ copyAudioFiles: event.target.checked })} />
                  {t("export.copyAudioFiles")}
                </label>
              ) : null}
            </section>

            <ExportPresetSelector
              presets={presets}
              currentConfig={currentConfig}
              onApply={applyPreset}
              onSaved={refreshPresets}
            />
          </div>

          <ExportPreviewPanel
            preview={preview}
            previewText={previewText}
            result={result}
            warningsAcknowledged={warningsAcknowledged}
            busy={busy}
            onWarningsAcknowledgedChange={setWarningsAcknowledged}
            onPreview={refreshPreview}
            onRun={runExport}
          />
        </div>
      </section>
    </div>
  );
}

function createDefaultOptions(selectedAssetIds: string[], currentQuery: AssetListQuery): ExportOptions {
  return {
    target: "codex_markdown",
    source: selectedAssetIds.length > 0 ? { type: "selected", assetIds: selectedAssetIds } : { type: "query", query: currentQuery },
    includeTrashed: false,
    includeAbsolutePaths: false,
    includeCollections: true,
    includeMemo: true,
    includeRights: true,
    copyAudioFiles: true,
    groupBy: "category",
    useSafeFilenames: true,
    codexGoal: "",
    codexTemplate: "unity_import_plan",
    soundPackName: "exported-sound-pack",
    acknowledgeWarnings: false,
  };
}
