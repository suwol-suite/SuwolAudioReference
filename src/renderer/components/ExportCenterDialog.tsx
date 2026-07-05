import { FileOutput, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  CodexInstructionTemplate,
  ExportHistoryRecord,
  ExportOptions,
  ExportPresetRecord,
  ExportPreview,
  ExportRunResult,
  ExportSource,
  ExportTargetType,
  ManifestPreviewInput,
  ProjectExportSourceSummary,
} from "../../shared/export-types";
import type {
  ProjectSoundPackDryRun,
  ProjectSoundPackEngineProfile,
  ProjectSoundPackFilenamePolicy,
  ProjectSoundPackOptions,
} from "../../shared/project-sound-pack-types";
import type { SoundBoardExportFormat, SoundBoardExportOptions, SoundRequestExportOptions } from "../../shared/sound-board-types";
import type { AssetListQuery, CollectionRecord, SmartFolderId, TagRecord } from "../../shared/library-types";
import type { MessageKey } from "../i18n/i18n";
import { useI18n } from "../i18n/useI18n";
import { ExportPresetSelector } from "./ExportPresetSelector";
import { ExportPreviewPanel } from "./ExportPreviewPanel";
import { ProjectSoundPackPreview } from "./ProjectSoundPackPreview";

interface ExportCenterDialogProps {
  open: boolean;
  selectedAssetIds: string[];
  currentQuery: AssetListQuery;
  tags: TagRecord[];
  collections: CollectionRecord[];
  initialOptions?: Partial<ExportOptions> | null;
  onClose: () => void;
}

export type ExportCenterInitialOptions = Partial<ExportOptions>;

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
  "project_sound_pack",
  "project_manifest",
  "project_missing_report",
  "project_codex_instruction",
  "sound_request_markdown",
  "sound_request_csv",
  "sound_request_json",
  "project_style_guide_markdown",
  "project_checklist_markdown",
  "sound_pack_snapshot_json",
  "sound_pack_changelog_markdown",
  "sound_pack_changelog_json",
  "sound_pack_changelog_csv",
  "sound_change_review_markdown",
  "sound_change_review_json",
  "sound_change_review_csv",
];

const PROJECT_TARGET_OPTIONS = new Set<ExportTargetType>([
  "project_sound_pack",
  "project_manifest",
  "project_missing_report",
  "project_codex_instruction",
  "sound_request_markdown",
  "sound_request_csv",
  "sound_request_json",
  "project_style_guide_markdown",
  "project_checklist_markdown",
  "sound_pack_snapshot_json",
  "sound_pack_changelog_markdown",
  "sound_pack_changelog_json",
  "sound_pack_changelog_csv",
  "sound_change_review_markdown",
  "sound_change_review_json",
  "sound_change_review_csv",
]);

const ENGINE_OPTIONS: ProjectSoundPackEngineProfile[] = ["generic", "unity", "unreal", "monogame"];
const FILENAME_OPTIONS: ProjectSoundPackFilenamePolicy[] = ["keep_original", "usage_key", "category_usage_key"];

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
  initialOptions,
  onClose,
}: ExportCenterDialogProps): JSX.Element | null {
  const { t } = useI18n();
  const [options, setOptions] = useState<ExportOptions>(() => createDefaultOptions(selectedAssetIds, currentQuery));
  const [presets, setPresets] = useState<ExportPresetRecord[]>([]);
  const [projectSources, setProjectSources] = useState<ProjectExportSourceSummary[]>([]);
  const [history, setHistory] = useState<ExportHistoryRecord[]>([]);
  const [preview, setPreview] = useState<ExportPreview | null>(null);
  const [previewText, setPreviewText] = useState("");
  const [projectSoundPackPreview, setProjectSoundPackPreview] = useState<ProjectSoundPackDryRun | null>(null);
  const [result, setResult] = useState<ExportRunResult | null>(null);
  const [warningsAcknowledged, setWarningsAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);

  const sourceKind = options.source.type;
  const selectedCollectionId = options.source.type === "collection" ? options.source.collectionId : "";
  const selectedTagId = options.source.type === "tag" ? options.source.tagId : "";
  const selectedSmartFolder = options.source.type === "smartFolder" ? options.source.smartFolder : "all";
  const selectedProjectId = options.source.type === "gameProject" ? options.source.projectId : "";
  const selectedProjectSource = projectSources.find((source) => source.project.id === selectedProjectId) ?? projectSources[0] ?? null;
  const isCodexTarget = options.target === "codex_markdown" || options.target === "codex_json";
  const isProjectTarget = PROJECT_TARGET_OPTIONS.has(options.target);
  const isSoundRequestTarget = [
    "sound_request_markdown",
    "sound_request_csv",
    "sound_request_json",
    "project_style_guide_markdown",
    "project_checklist_markdown",
  ].includes(options.target);
  const isSnapshotTarget = options.target === "sound_pack_snapshot_json";
  const isSoundPackChangelogTarget = [
    "sound_pack_changelog_markdown",
    "sound_pack_changelog_json",
    "sound_pack_changelog_csv",
  ].includes(options.target);
  const isSoundChangeReviewTarget = [
    "sound_change_review_markdown",
    "sound_change_review_json",
    "sound_change_review_csv",
  ].includes(options.target);
  const needsProjectEngineOptions = ["project_sound_pack", "project_manifest", "project_codex_instruction"].includes(options.target);
  const isManifestTarget = !isProjectTarget && !isCodexTarget && options.target !== "sound_pack_folder" && options.target !== "sound_pack_metadata" && options.target !== "csv_report";

  const currentConfig = useMemo(() => options, [options]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const source = selectedAssetIds.length > 0 ? { type: "selected" as const, assetIds: selectedAssetIds } : { type: "query" as const, query: currentQuery, label: t("export.currentFilter") };
    setOptions({
      ...createDefaultOptions(selectedAssetIds, currentQuery),
      ...initialOptions,
      source: initialOptions?.source ?? source,
    });
    setPreview(null);
    setPreviewText("");
    setProjectSoundPackPreview(null);
    setResult(null);
    setWarningsAcknowledged(false);
    void refreshPresets();
    void refreshProjectSources();
    void refreshHistory();
  }, [open, selectedAssetIds.join("|"), initialOptions]);

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

  async function refreshProjectSources(): Promise<void> {
    setProjectSources(await window.suwolAudio.export.projectSourcesList());
  }

  async function refreshHistory(): Promise<void> {
    setHistory(await window.suwolAudio.export.historyList({ limit: 8 }));
  }

  function updateOptions(input: Partial<ExportOptions>): void {
    setOptions((current) => ({ ...current, ...input }));
    setPreview(null);
    setPreviewText("");
    setProjectSoundPackPreview(null);
    setResult(null);
    setWarningsAcknowledged(false);
  }

  function updateSource(source: ExportSource): void {
    updateOptions({
      source,
      target: source.type !== "gameProject" && PROJECT_TARGET_OPTIONS.has(options.target) ? "codex_markdown" : options.target,
    });
  }

  function applyPreset(config: Partial<ExportOptions>): void {
    setOptions((current) => ({ ...current, ...config, source: config.source ?? current.source }));
    setPreview(null);
    setPreviewText("");
    setProjectSoundPackPreview(null);
    setResult(null);
  }

  async function refreshPreview(): Promise<void> {
    setBusy(true);
    setResult(null);
    try {
      const nextPreview = await window.suwolAudio.export.preview(options);
      setPreview(nextPreview);
      if (options.target === "project_sound_pack" && options.source.type === "gameProject") {
        setProjectSoundPackPreview(await window.suwolAudio.projectSoundPack.preview(toProjectSoundPackOptions(options)));
        setPreviewText("");
      } else if (isSoundRequestTarget && options.source.type === "gameProject") {
        const requestPreview = await window.suwolAudio.soundRequest.preview(toSoundRequestExportOptions(options));
        setProjectSoundPackPreview(null);
        setPreviewText(requestPreview.previewText ?? "");
      } else if (isSoundPackChangelogTarget && options.source.type === "gameProject") {
        const fromSnapshotId = options.fromSnapshotId ?? options.snapshotId ?? options.baselineSnapshotId ?? "";
        if (!fromSnapshotId) {
          setProjectSoundPackPreview(null);
          setPreviewText("");
          return;
        }
        const changelogPreview = await window.suwolAudio.soundSnapshots.changelogPreview({
          projectId: options.source.projectId,
          fromSnapshotId,
          toSnapshotId: options.toSnapshotId,
          compareToCurrent: options.compareToCurrent ?? true,
          format: soundPackChangelogFormatForTarget(options.target),
          includeDiffSummary: options.includeDiffSummary,
          includeCandidateChanges: options.includeCandidateChanges,
          includeRightsChanges: options.includeRightsChanges,
          includeRiskChanges: options.includeRiskChanges,
          reviewId: options.reviewId,
          includeReviewDecisions: options.includeReviewDecisions,
          approvedChangesOnly: options.approvedChangesOnly,
          excludeRejectedChanges: options.excludeRejectedChanges,
          includeDeferredChanges: options.includeDeferredChanges,
        });
        setProjectSoundPackPreview(null);
        setPreviewText(changelogPreview.previewText);
      } else if (isSoundChangeReviewTarget && options.source.type === "gameProject") {
        if (!options.reviewId) {
          setProjectSoundPackPreview(null);
          setPreviewText("");
          return;
        }
        const reviewPreview = await window.suwolAudio.changeReviews.exportPreview(toSoundChangeReviewExportOptions(options));
        setProjectSoundPackPreview(null);
        setPreviewText(reviewPreview.previewText);
      } else if (isSnapshotTarget && options.source.type === "gameProject") {
        const snapshot = options.snapshotId
          ? await window.suwolAudio.soundSnapshots.get(options.snapshotId)
          : null;
        setProjectSoundPackPreview(null);
        setPreviewText(snapshot ? `${JSON.stringify(snapshot.payload, null, 2)}\n` : "");
      } else if (isProjectTarget && options.source.type === "gameProject") {
        const boardPreview = await window.suwolAudio.soundBoardExport.projectPreview(toSoundBoardExportOptions(options));
        setProjectSoundPackPreview(null);
        setPreviewText(boardPreview.previewText ?? "");
      } else if (isCodexTarget) {
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
        setProjectSoundPackPreview(null);
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
        void refreshHistory();
      }
    } finally {
      setBusy(false);
    }
  }

  async function deleteHistory(historyId: string): Promise<void> {
    await window.suwolAudio.export.historyDelete(historyId);
    await refreshHistory();
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
                  } else if (next === "gameProject") {
                    const project = projectSources[0]?.project;
                    updateSource(project ? { type: "gameProject", projectId: project.id, name: project.name } : { type: "library" });
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
                <option value="gameProject" disabled={projectSources.length === 0}>{t("export.source.gameProject")}</option>
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

              {sourceKind === "gameProject" ? (
                <>
                  <select
                    value={selectedProjectId}
                    onChange={(event) => {
                      const source = projectSources.find((item) => item.project.id === event.target.value);
                      if (source) {
                        updateSource({ type: "gameProject", projectId: source.project.id, name: source.project.name });
                      }
                    }}
                  >
                    {projectSources.map((source) => (
                      <option key={source.project.id} value={source.project.id}>
                        {source.project.name}
                      </option>
                    ))}
                  </select>
                  {selectedProjectSource ? (
                    <dl className="export-project-summary">
                      <div><dt>{t("export.project.total")}</dt><dd>{selectedProjectSource.summary.total}</dd></div>
                      <div><dt>{t("export.project.approved")}</dt><dd>{selectedProjectSource.summary.approved}</dd></div>
                      <div><dt>{t("export.project.requiredMissing")}</dt><dd>{selectedProjectSource.summary.requiredMissing}</dd></div>
                      <div><dt>{t("export.project.risks")}</dt><dd>{selectedProjectSource.riskCount}</dd></div>
                    </dl>
                  ) : null}
                </>
              ) : null}
            </section>

            <section className="export-section">
              <h3>{t("export.target")}</h3>
              <select value={options.target} onChange={(event) => updateOptions({ target: event.target.value as ExportTargetType })}>
                {TARGET_OPTIONS.map((target) => (
                  <option key={target} value={target} disabled={PROJECT_TARGET_OPTIONS.has(target) && sourceKind !== "gameProject"}>
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
              {isProjectTarget ? (
                <div className="project-export-options">
                  {needsProjectEngineOptions ? (
                    <label className="settings-row">
                      {t("projectSoundPack.engineProfile" as MessageKey)}
                      <select value={options.engineProfile ?? "generic"} onChange={(event) => updateOptions({ engineProfile: event.target.value as ProjectSoundPackEngineProfile })}>
                        {ENGINE_OPTIONS.map((engine) => (
                          <option key={engine} value={engine}>{t(`soundBoard.engine.${engine}` as MessageKey)}</option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {options.target === "project_sound_pack" ? (
                    <>
                      <input
                        value={options.soundPackName}
                        placeholder={t("export.soundPackName")}
                        onChange={(event) => updateOptions({ soundPackName: event.target.value })}
                      />
                      <label className="settings-row">
                        {t("projectSoundPack.filenamePolicy" as MessageKey)}
                        <select value={options.filenamePolicy ?? "keep_original"} onChange={(event) => updateOptions({ filenamePolicy: event.target.value as ProjectSoundPackFilenamePolicy })}>
                          {FILENAME_OPTIONS.map((policy) => (
                            <option key={policy} value={policy}>{t(`projectSoundPack.filename.${policy}` as MessageKey)}</option>
                          ))}
                        </select>
                      </label>
                    </>
                  ) : null}
                </div>
              ) : null}
            </section>

            <section className="export-section">
              <h3>{t("export.options")}</h3>
              {!isProjectTarget ? (
                <label className="settings-toggle">
                  <input type="checkbox" checked={options.includeTrashed} onChange={(event) => updateOptions({ includeTrashed: event.target.checked })} />
                  {t("export.includeTrashed")}
                </label>
              ) : null}
              <label className="settings-toggle">
                <input type="checkbox" checked={options.includeRights} onChange={(event) => updateOptions({ includeRights: event.target.checked })} />
                {t("export.includeRights")}
              </label>
              <label className="settings-toggle">
                <input type="checkbox" checked={options.includeAbsolutePaths} onChange={(event) => updateOptions({ includeAbsolutePaths: event.target.checked })} />
                {t("export.includeAbsolutePaths")}
              </label>
              {!isProjectTarget ? (
                <>
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
                </>
              ) : null}
              {options.target === "sound_pack_folder" ? (
                <label className="settings-toggle">
                  <input type="checkbox" checked={options.copyAudioFiles} onChange={(event) => updateOptions({ copyAudioFiles: event.target.checked })} />
                  {t("export.copyAudioFiles")}
                </label>
              ) : null}
              {isProjectTarget ? (
                <>
                  <label className="settings-toggle">
                    <input type="checkbox" checked={options.includeBoardSummary ?? true} onChange={(event) => updateOptions({ includeBoardSummary: event.target.checked })} />
                    {t("export.includeBoardSummary")}
                  </label>
                  <label className="settings-toggle">
                    <input type="checkbox" checked={options.includeValidationReport ?? true} onChange={(event) => updateOptions({ includeValidationReport: event.target.checked })} />
                    {t("export.includeValidationReport")}
                  </label>
                  <label className="settings-toggle">
                    <input type="checkbox" checked={options.includeCandidates ?? true} onChange={(event) => updateOptions({ includeCandidates: event.target.checked })} />
                    {t("projectSoundPack.includeCandidates" as MessageKey)}
                  </label>
                  <label className="settings-toggle">
                    <input type="checkbox" checked={options.includeRejectedCandidates ?? false} onChange={(event) => updateOptions({ includeRejectedCandidates: event.target.checked })} />
                    {t("export.includeRejectedCandidates")}
                  </label>
                  <label className="settings-toggle">
                    <input type="checkbox" checked={options.includeStyleGuide ?? true} onChange={(event) => updateOptions({ includeStyleGuide: event.target.checked })} />
                    {t("export.includeStyleGuide" as MessageKey)}
                  </label>
                  <label className="settings-toggle">
                    <input type="checkbox" checked={options.includeChecklist ?? true} onChange={(event) => updateOptions({ includeChecklist: event.target.checked })} />
                    {t("export.includeChecklist" as MessageKey)}
                  </label>
                  <label className="settings-toggle">
                    <input type="checkbox" checked={options.includeWorkNotes ?? false} onChange={(event) => updateOptions({ includeWorkNotes: event.target.checked })} />
                    {t("export.includeWorkNotes" as MessageKey)}
                  </label>
                  <label className="settings-toggle">
                    <input type="checkbox" checked={options.includeReviewNotes ?? false} onChange={(event) => updateOptions({ includeReviewNotes: event.target.checked })} />
                    {t("export.includeReviewNotes" as MessageKey)}
                  </label>
                  <label className="settings-toggle">
                    <input type="checkbox" checked={options.includeCandidateReviewNotes ?? false} onChange={(event) => updateOptions({ includeCandidateReviewNotes: event.target.checked })} />
                    {t("export.includeCandidateReviewNotes" as MessageKey)}
                  </label>
                  <label className="settings-toggle">
                    <input type="checkbox" checked={options.includeDecisionNotes ?? false} onChange={(event) => updateOptions({ includeDecisionNotes: event.target.checked })} />
                    {t("export.includeDecisionNotes" as MessageKey)}
                  </label>
                  <label className="settings-toggle">
                    <input type="checkbox" checked={options.createSnapshotBeforeExport ?? false} onChange={(event) => updateOptions({ createSnapshotBeforeExport: event.target.checked })} />
                    {t("export.createSnapshotBeforeExport" as MessageKey)}
                  </label>
                  {isSoundPackChangelogTarget ? (
                    <>
                      <label className="settings-toggle">
                        <input type="checkbox" checked={options.includeReviewDecisions ?? false} onChange={(event) => updateOptions({ includeReviewDecisions: event.target.checked })} />
                        {t("export.includeReviewDecisions" as MessageKey)}
                      </label>
                      <label className="settings-toggle">
                        <input type="checkbox" checked={options.approvedChangesOnly ?? false} onChange={(event) => updateOptions({ approvedChangesOnly: event.target.checked })} />
                        {t("export.approvedChangesOnly" as MessageKey)}
                      </label>
                      <label className="settings-toggle">
                        <input type="checkbox" checked={options.excludeRejectedChanges ?? false} onChange={(event) => updateOptions({ excludeRejectedChanges: event.target.checked })} />
                        {t("export.excludeRejectedChanges" as MessageKey)}
                      </label>
                      <label className="settings-toggle">
                        <input type="checkbox" checked={options.includeDeferredChanges ?? true} onChange={(event) => updateOptions({ includeDeferredChanges: event.target.checked })} />
                        {t("export.includeDeferredChanges" as MessageKey)}
                      </label>
                    </>
                  ) : null}
                  {isSoundChangeReviewTarget ? (
                    <>
                      <label className="settings-toggle">
                        <input type="checkbox" checked={options.includePending ?? true} onChange={(event) => updateOptions({ includePending: event.target.checked })} />
                        {t("export.includePending" as MessageKey)}
                      </label>
                      <label className="settings-toggle">
                        <input type="checkbox" checked={options.includeApproved ?? true} onChange={(event) => updateOptions({ includeApproved: event.target.checked })} />
                        {t("export.includeApproved" as MessageKey)}
                      </label>
                      <label className="settings-toggle">
                        <input type="checkbox" checked={options.includeRejected ?? true} onChange={(event) => updateOptions({ includeRejected: event.target.checked })} />
                        {t("export.includeRejected" as MessageKey)}
                      </label>
                      <label className="settings-toggle">
                        <input type="checkbox" checked={options.includeDeferred ?? true} onChange={(event) => updateOptions({ includeDeferred: event.target.checked })} />
                        {t("export.includeDeferred" as MessageKey)}
                      </label>
                      <label className="settings-toggle">
                        <input type="checkbox" checked={options.includeReviewerNotes ?? true} onChange={(event) => updateOptions({ includeReviewerNotes: event.target.checked })} />
                        {t("export.includeReviewerNotes" as MessageKey)}
                      </label>
                      <label className="settings-toggle">
                        <input type="checkbox" checked={options.includeDecisionReasons ?? true} onChange={(event) => updateOptions({ includeDecisionReasons: event.target.checked })} />
                        {t("export.includeDecisionReasons" as MessageKey)}
                      </label>
                      <label className="settings-toggle">
                        <input type="checkbox" checked={options.includeBeforeAfterDetails ?? false} onChange={(event) => updateOptions({ includeBeforeAfterDetails: event.target.checked })} />
                        {t("export.includeBeforeAfterDetails" as MessageKey)}
                      </label>
                    </>
                  ) : null}
                  {options.target === "project_sound_pack" ? (
                    <>
                      <label className="settings-toggle">
                        <input type="checkbox" checked={options.approvedOnly ?? true} onChange={(event) => updateOptions({ approvedOnly: event.target.checked, includeSelectedUnapproved: !event.target.checked })} />
                        {t("export.approvedOnly")}
                      </label>
                      <label className="settings-toggle">
                        <input type="checkbox" checked={options.copyAudioFiles} onChange={(event) => updateOptions({ copyAudioFiles: event.target.checked })} />
                        {t("export.copyAudioFiles")}
                      </label>
                      <label className="settings-toggle">
                        <input type="checkbox" checked={options.includeLatestChangeReviewSummary ?? true} onChange={(event) => updateOptions({ includeLatestChangeReviewSummary: event.target.checked })} />
                        {t("export.includeLatestChangeReviewSummary" as MessageKey)}
                      </label>
                      <label className="settings-toggle">
                        <input type="checkbox" checked={options.includeReviewReport ?? false} onChange={(event) => updateOptions({ includeReviewReport: event.target.checked })} />
                        {t("export.includeReviewReport" as MessageKey)}
                      </label>
                    </>
                  ) : null}
                </>
              ) : null}
            </section>

            <ExportPresetSelector
              presets={presets}
              currentConfig={currentConfig}
              onApply={applyPreset}
              onSaved={refreshPresets}
            />

            <section className="export-section">
              <h3>{t("export.history")}</h3>
              {history.length === 0 ? <p className="muted">{t("export.historyEmpty")}</p> : null}
              <div className="export-history-list">
                {history.map((item) => (
                  <div key={item.id} className={`export-history-item ${item.status}`}>
                    <span>{t(`export.target.${item.target}` as MessageKey)}</span>
                    <small>{item.sourceLabel}</small>
                    <small>{new Date(item.createdAt).toLocaleString()}</small>
                    <button className="icon-button" type="button" onClick={() => void deleteHistory(item.id)} title={t("common.delete")} aria-label={t("common.delete")}>
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="export-preview-stack">
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
            {options.target === "project_sound_pack" ? (
              <ProjectSoundPackPreview
                preview={projectSoundPackPreview}
                result={null}
                onOpenOutput={(outputPath) => void window.suwolAudio.export.showOutputPath(outputPath)}
              />
            ) : null}
          </div>
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
    engineProfile: "generic",
    filenamePolicy: "keep_original",
    approvedOnly: true,
    includeSelectedUnapproved: false,
    includeCandidates: true,
    includeRejectedCandidates: false,
    includeMissingItems: true,
    includeUsageNotes: true,
    includeBoardSummary: true,
    includeValidationReport: true,
    includeMissingReport: true,
    includeReadme: true,
    includeCredits: true,
    includeManifest: true,
    includeStyleGuide: true,
    includeChecklist: true,
    includeWorkNotes: false,
    includeReviewNotes: false,
    includeCandidateReviewNotes: false,
    includeDecisionNotes: false,
    compareToCurrent: true,
    createSnapshotBeforeExport: false,
    useSnapshotAsExportSource: false,
    includeDiffSummary: true,
    includeRightsChanges: true,
    includeRiskChanges: true,
    includeCandidateChanges: true,
    includePending: true,
    includeApproved: true,
    includeRejected: true,
    includeDeferred: true,
    includeReviewerNotes: true,
    includeDecisionReasons: true,
    includeBeforeAfterDetails: false,
    includeReviewDecisions: false,
    approvedChangesOnly: false,
    excludeRejectedChanges: false,
    includeDeferredChanges: true,
    includeLatestChangeReviewSummary: true,
    includeReviewReport: false,
  };
}

function toProjectSoundPackOptions(options: ExportOptions): ProjectSoundPackOptions {
  if (options.source.type !== "gameProject") {
    return { projectId: "" };
  }
  return {
    projectId: options.source.projectId,
    usageItemIds: options.source.usageItemIds,
    engineProfile: options.engineProfile,
    soundPackName: options.soundPackName,
    approvedOnly: options.approvedOnly,
    includeSelectedUnapproved: options.includeSelectedUnapproved,
    includeCandidates: options.includeCandidates,
    includeRejectedCandidates: options.includeRejectedCandidates,
    includeMissingReport: options.includeMissingReport,
    includeValidationReport: options.includeValidationReport,
    includeRights: options.includeRights,
    includeBoardSummary: options.includeBoardSummary,
    includeReadme: options.includeReadme,
    includeCredits: options.includeCredits,
    includeManifest: options.includeManifest,
    includeStyleGuide: options.includeStyleGuide,
    includeChecklist: options.includeChecklist,
    includeWorkNotes: options.includeWorkNotes,
    includeReviewNotes: options.includeReviewNotes,
    includeCandidateReviewNotes: options.includeCandidateReviewNotes,
    includeDecisionNotes: options.includeDecisionNotes,
    includeLatestChangeReviewSummary: options.includeLatestChangeReviewSummary,
    includeReviewReport: options.includeReviewReport,
    copyAudioFiles: options.copyAudioFiles,
    filenamePolicy: options.filenamePolicy,
    acknowledgeWarnings: options.acknowledgeWarnings,
  };
}

function toSoundChangeReviewExportOptions(options: ExportOptions) {
  return {
    reviewId: options.reviewId ?? "",
    format: soundChangeReviewFormatForTarget(options.target),
    includePending: options.includePending,
    includeApproved: options.includeApproved,
    includeRejected: options.includeRejected,
    includeDeferred: options.includeDeferred,
    includeReviewerNotes: options.includeReviewerNotes,
    includeDecisionReasons: options.includeDecisionReasons,
    includeRiskChanges: options.includeRiskChanges,
    includeRightsChanges: options.includeRightsChanges,
    includeBeforeAfterDetails: options.includeBeforeAfterDetails,
    includeAbsolutePaths: options.includeAbsolutePaths,
  };
}

function toSoundRequestExportOptions(options: ExportOptions): SoundRequestExportOptions & { outputPath?: string } {
  return {
    projectId: options.source.type === "gameProject" ? options.source.projectId : "",
    format: soundRequestFormatForTarget(options.target),
    documentType: soundRequestDocumentForTarget(options.target),
    usageItemIds: options.source.type === "gameProject" ? options.source.usageItemIds : undefined,
    includeMissingItems: options.includeMissingItems,
    includeCandidates: options.includeCandidates,
    includeRejectedCandidates: options.includeRejectedCandidates,
    includeStyleGuide: options.includeStyleGuide,
    includeChecklist: options.includeChecklist,
    includeWorkNotes: options.includeWorkNotes,
    includeReviewNotes: options.includeReviewNotes,
    includeCandidateReviewNotes: options.includeCandidateReviewNotes,
    includeDecisionNotes: options.includeDecisionNotes,
    includeAbsolutePaths: options.includeAbsolutePaths,
    includeRights: options.includeRights,
  };
}

function soundRequestFormatForTarget(target: ExportTargetType): SoundRequestExportOptions["format"] {
  if (target === "sound_request_csv") {
    return "csv";
  }
  if (target === "sound_request_json") {
    return "json";
  }
  return "markdown";
}

function soundRequestDocumentForTarget(target: ExportTargetType): SoundRequestExportOptions["documentType"] {
  if (target === "project_style_guide_markdown") {
    return "style_guide";
  }
  if (target === "project_checklist_markdown") {
    return "checklist";
  }
  return "request";
}

function soundPackChangelogFormatForTarget(target: ExportTargetType): "markdown" | "json" | "csv" {
  if (target === "sound_pack_changelog_json") {
    return "json";
  }
  if (target === "sound_pack_changelog_csv") {
    return "csv";
  }
  return "markdown";
}

function soundChangeReviewFormatForTarget(target: ExportTargetType): "markdown" | "json" | "csv" {
  if (target === "sound_change_review_json") {
    return "json";
  }
  if (target === "sound_change_review_csv") {
    return "csv";
  }
  return "markdown";
}

function toSoundBoardExportOptions(options: ExportOptions): SoundBoardExportOptions & { outputPath?: string } {
  return {
    projectId: options.source.type === "gameProject" ? options.source.projectId : "",
    format: projectFormatForTarget(options),
    usageItemIds: options.source.type === "gameProject" ? options.source.usageItemIds : undefined,
    includeCandidates: options.includeCandidates,
    includeRejectedCandidates: options.includeRejectedCandidates,
    includeMissingItems: options.includeMissingItems,
    includeUsageNotes: options.includeUsageNotes,
    includeRights: options.includeRights,
    includeAbsolutePaths: options.includeAbsolutePaths,
    includeBoardSummary: options.includeBoardSummary,
    includeValidationReport: options.includeValidationReport,
    includeStyleGuide: options.includeStyleGuide,
    includeChecklist: options.includeChecklist,
    includeWorkNotes: options.includeWorkNotes,
    includeReviewNotes: options.includeReviewNotes,
    includeCandidateReviewNotes: options.includeCandidateReviewNotes,
    includeDecisionNotes: options.includeDecisionNotes,
    selectedOnly: options.source.type === "gameProject" && Boolean(options.source.usageItemIds?.length),
  };
}

function projectFormatForTarget(options: ExportOptions): SoundBoardExportFormat {
  if (options.target === "project_missing_report") {
    return "missing_report";
  }
  if (options.target === "project_codex_instruction") {
    return "codex_instruction";
  }
  if (options.engineProfile === "unity") {
    return "unity_manifest";
  }
  if (options.engineProfile === "unreal") {
    return "unreal_manifest";
  }
  if (options.engineProfile === "monogame") {
    return "monogame_manifest";
  }
  return "generic_manifest";
}
