import { useState } from "react";
import type {
  BulkRelinkPreview,
  CollectionUsageRecord,
  DuplicateGroupSummary,
  ImportSourceRecord,
  ImportSourceScanResult,
  LibraryDiagnostics,
  MissingFileRecord,
  TagUsageRecord,
} from "../../shared/library-types";
import { useI18n } from "../i18n/useI18n";
import { EmptyState } from "./ui/EmptyState";
import { ProgressDialog } from "./ui/ProgressDialog";
import { useConfirm } from "./ui/ConfirmDialog";
import { useToast } from "./ui/ToastProvider";

interface LibraryManagementPanelProps {
  diagnostics?: LibraryDiagnostics | null;
  onDiagnosticsChange: (diagnostics: LibraryDiagnostics | null) => void;
  selectedAssetIds: string[];
}

export function LibraryManagementPanel({
  diagnostics,
  onDiagnosticsChange,
  selectedAssetIds,
}: LibraryManagementPanelProps): JSX.Element {
  const { t, format } = useI18n();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [message, setMessage] = useState<string | null>(null);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [missingFiles, setMissingFiles] = useState<MissingFileRecord[]>([]);
  const [bulkRelink, setBulkRelink] = useState<BulkRelinkPreview | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateGroupSummary[]>([]);
  const [tags, setTags] = useState<TagUsageRecord[]>([]);
  const [collections, setCollections] = useState<CollectionUsageRecord[]>([]);
  const [importSources, setImportSources] = useState<ImportSourceRecord[]>([]);
  const [lastScan, setLastScan] = useState<ImportSourceScanResult | null>(null);

  async function runTask(label: string, task: () => Promise<void>): Promise<void> {
    setBusyLabel(label);
    try {
      await task();
      showToast("success", label);
    } catch {
      showToast("error", label);
    } finally {
      setBusyLabel(null);
    }
  }

  async function runDiagnostics(): Promise<void> {
    const result = await window.suwolAudio.diagnostics.runLibraryDiagnostics();
    onDiagnosticsChange(result);
    setMessage(result ? t("management.diagnosticsComplete") : t("diagnostics.noLibrary"));
  }

  async function listMissing(): Promise<void> {
    const result = await window.suwolAudio.assets.listMissing();
    setMissingFiles(result);
    setMessage(t("management.missingFound", { count: format.number(result.length) }));
  }

  async function relink(assetId: string): Promise<void> {
    const result = await window.suwolAudio.assets.relink({ assetId });
    if (result) {
      await listMissing();
      setMessage(t("management.relinkComplete"));
    }
  }

  async function previewBulkRelink(): Promise<void> {
    const result = await window.suwolAudio.assets.bulkRelinkPreview();
    setBulkRelink(result);
    if (result) {
      setMessage(t("management.bulkRelinkCandidates", { count: format.number(result.candidates.length) }));
    }
  }

  async function applyBulkRelink(): Promise<void> {
    if (!bulkRelink) {
      return;
    }
    if (
      !(await confirm({
        title: t("management.bulkRelink"),
        message: t("management.confirmBulkRelink", { count: format.number(bulkRelink.candidates.length) }),
        confirmLabel: t("common.apply"),
      }))
    ) {
      return;
    }
    const result = await window.suwolAudio.assets.bulkRelinkApply({ candidates: bulkRelink.candidates });
    setMessage(t("batch.complete", {
      label: t("management.bulkRelink"),
      success: format.number(result.success),
      failed: format.number(result.failed),
      skipped: format.number(result.skipped),
    }));
    await listMissing();
  }

  async function loadDuplicates(): Promise<void> {
    const result = await window.suwolAudio.duplicates.listGroups();
    setDuplicates(result);
    setMessage(t("management.duplicateGroups", { count: format.number(result.length) }));
  }

  async function mergeDuplicate(group: DuplicateGroupSummary): Promise<void> {
    const keepAssetId = group.assets[0]?.asset.id;
    const mergeAssetIds = group.assets.slice(1).map((item) => item.asset.id);
    if (
      !keepAssetId ||
      mergeAssetIds.length === 0 ||
      !(await confirm({
        title: t("management.mergeMetadata"),
        message: t("management.confirmMetadataMerge"),
        confirmLabel: t("management.mergeMetadata"),
      }))
    ) {
      return;
    }
    await window.suwolAudio.duplicates.mergeMetadata({
      contentHash: group.contentHash,
      keepAssetId,
      mergeAssetIds,
      mergeTags: true,
      mergeCollections: true,
      mergeFavorite: true,
      mergeRating: "highest",
    });
    setMessage(t("management.metadataMergeComplete"));
  }

  async function trashDuplicateAssets(group: DuplicateGroupSummary): Promise<void> {
    const keepAssetId = group.assets[0]?.asset.id;
    const duplicateAssetIds = group.assets.slice(1).map((item) => item.asset.id);
    if (
      !keepAssetId ||
      duplicateAssetIds.length === 0 ||
      !(await confirm({
        title: t("management.duplicates"),
        message: t("management.confirmTrashDuplicates"),
        confirmLabel: t("trash.title"),
        danger: true,
      }))
    ) {
      return;
    }
    await window.suwolAudio.duplicates.trashDuplicates({ keepAssetId, duplicateAssetIds });
    await loadDuplicates();
  }

  async function backup(): Promise<void> {
    const preview = await window.suwolAudio.library.backupPreview();
    if (
      !preview ||
      !(await confirm({
        title: t("management.backup"),
        message: t("management.confirmBackup", { path: preview.finalPath }),
        confirmLabel: t("management.backup"),
      }))
    ) {
      return;
    }
    const result = await window.suwolAudio.library.backupStart({ destinationPath: preview.destinationPath });
    if (result) {
      setMessage(t("management.backupComplete", { path: result.destinationPath }));
    }
  }

  async function restorePreview(): Promise<void> {
    const result = await window.suwolAudio.library.restorePreview();
    if (result) {
      setMessage(result.canRestore ? t("management.restorePreviewReady") : result.warnings.join(", "));
    }
  }

  async function exportMetadata(format: "json" | "csv"): Promise<void> {
    const result = await window.suwolAudio.library.exportMetadata({
      format,
      includePaths: false,
      includeTrashed: true,
      includeAnalysis: true,
      includePlayback: true,
    });
    if (result) {
      setMessage(t("management.exportComplete", { path: result.outputPath }));
    }
  }

  async function loadTags(): Promise<void> {
    setTags(await window.suwolAudio.tags.listWithUsage());
  }

  async function renameTag(tag: TagUsageRecord): Promise<void> {
    const name = window.prompt(t("management.renameTag"), tag.name);
    if (!name?.trim()) {
      return;
    }
    await window.suwolAudio.tags.rename({ tagId: tag.id, name });
    await loadTags();
  }

  async function loadCollections(): Promise<void> {
    setCollections(await window.suwolAudio.collections.listWithUsage());
  }

  async function renameCollection(collection: CollectionUsageRecord): Promise<void> {
    const name = window.prompt(t("management.renameCollection"), collection.name);
    if (!name?.trim()) {
      return;
    }
    await window.suwolAudio.collections.rename({ collectionId: collection.id, name });
    await loadCollections();
  }

  async function loadImportSources(): Promise<void> {
    setImportSources(await window.suwolAudio.importSources.list());
  }

  async function addImportSource(): Promise<void> {
    const source = await window.suwolAudio.importSources.add({ importMode: "copy" });
    if (source) {
      await loadImportSources();
    }
  }

  async function scanImportSource(sourceId: string): Promise<void> {
    const result = await window.suwolAudio.importSources.scan(sourceId);
    setLastScan(result);
    setMessage(t("management.scanComplete", { count: format.number(result.newFiles.length) }));
  }

  async function exportSidecars(): Promise<void> {
    if (selectedAssetIds.length === 0) {
      setMessage(t("management.noSelectedAssets"));
      return;
    }
    const result = await window.suwolAudio.assets.exportSidecars({ assetIds: selectedAssetIds, overwrite: false });
    setMessage(t("management.sidecarComplete", { count: format.number(result.success) }));
  }

  return (
    <div className="management-panel">
      <ProgressDialog open={Boolean(busyLabel)} title={busyLabel ?? t("common.loading")} />
      {message ? <p className="status-line compact-status">{message}</p> : null}

      <section className="management-section">
        <h3>{t("management.diagnostics")}</h3>
        <button className="secondary-button compact" type="button" onClick={() => void runTask(t("diagnostics.run"), runDiagnostics)}>
          {t("diagnostics.run")}
        </button>
        {diagnostics ? (
          <dl className="diagnostics-grid">
            <Metric label={t("diagnostics.ok")} value={diagnostics.ok ? t("diagnostics.ok") : t("common.failed")} />
            <Metric label={t("diagnostics.dbIntegrity")} value={diagnostics.dbIntegrity} />
            <Metric label={t("diagnostics.migrationVersion")} value={diagnostics.migrationVersion} />
            <Metric label={t("diagnostics.assetCount")} value={format.number(diagnostics.assetCount)} />
            <Metric label={t("diagnostics.missingFiles")} value={format.number(diagnostics.missingFiles)} />
            <Metric label={t("diagnostics.orphanRows")} value={format.number(diagnostics.orphanTags + diagnostics.orphanCollectionRelations + diagnostics.orphanAnalysisRows)} />
            <Metric label={t("diagnostics.waveformMissing")} value={format.number(diagnostics.waveformMissing)} />
          </dl>
        ) : null}
      </section>

      <section className="management-section">
        <h3>{t("management.missingFiles")}</h3>
        <div className="management-actions">
          <button className="secondary-button compact" type="button" onClick={() => void runTask(t("management.detectMissing"), listMissing)}>{t("management.detectMissing")}</button>
          <button className="secondary-button compact" type="button" onClick={() => void runTask(t("management.bulkRelinkPreview"), previewBulkRelink)}>{t("management.bulkRelinkPreview")}</button>
          <button className="secondary-button compact" type="button" disabled={!bulkRelink?.candidates.length} onClick={() => void runTask(t("management.bulkRelink"), applyBulkRelink)}>{t("common.apply")}</button>
        </div>
        {missingFiles.length === 0 && !bulkRelink ? <EmptyState title={t("management.noMissingFiles")} /> : null}
        {missingFiles.slice(0, 5).map((item) => (
          <div className="management-row" key={item.assetId}>
            <span title={item.expectedPath}>{item.fileName}</span>
            <button className="secondary-button compact" type="button" onClick={() => relink(item.assetId)}>{t("management.relink")}</button>
          </div>
        ))}
        {bulkRelink ? <p className="muted">{t("management.bulkRelinkCandidates", { count: format.number(bulkRelink.candidates.length) })}</p> : null}
      </section>

      <section className="management-section">
        <h3>{t("management.duplicates")}</h3>
        <button className="secondary-button compact" type="button" onClick={() => void runTask(t("management.loadDuplicates"), loadDuplicates)}>{t("management.loadDuplicates")}</button>
        {duplicates.length === 0 ? <EmptyState title={t("management.noDuplicates")} /> : null}
        {duplicates.slice(0, 4).map((group) => (
          <div className="management-row" key={group.contentHash}>
            <span>{t("management.duplicateGroup", { count: format.number(group.count) })}</span>
            <button className="secondary-button compact" type="button" onClick={() => mergeDuplicate(group)}>{t("management.mergeMetadata")}</button>
            <button className="danger-button compact" type="button" onClick={() => trashDuplicateAssets(group)}>{t("trash.title")}</button>
          </div>
        ))}
      </section>

      <section className="management-section">
        <h3>{t("management.backupExport")}</h3>
        <div className="management-actions">
          <button className="secondary-button compact" type="button" onClick={() => void runTask(t("management.backup"), backup)}>{t("management.backup")}</button>
          <button className="secondary-button compact" type="button" onClick={() => void runTask(t("management.restorePreview"), restorePreview)}>{t("management.restorePreview")}</button>
          <button className="secondary-button compact" type="button" onClick={() => void runTask("JSON", () => exportMetadata("json"))}>JSON</button>
          <button className="secondary-button compact" type="button" onClick={() => void runTask("CSV", () => exportMetadata("csv"))}>CSV</button>
          <button className="secondary-button compact" type="button" onClick={() => void runTask(t("management.sidecarExport"), exportSidecars)}>{t("management.sidecarExport")}</button>
        </div>
      </section>

      <section className="management-section">
        <h3>{t("management.tagsCollections")}</h3>
        <div className="management-actions">
          <button className="secondary-button compact" type="button" onClick={() => void runTask(t("tag.title"), loadTags)}>{t("tag.title")}</button>
          <button className="secondary-button compact" type="button" onClick={() => void runTask(t("collection.title"), loadCollections)}>{t("collection.title")}</button>
          <button className="danger-button compact" type="button" onClick={async () => { await window.suwolAudio.tags.deleteUnused(); await loadTags(); }}>{t("management.deleteUnusedTags")}</button>
          <button className="danger-button compact" type="button" onClick={async () => { await window.suwolAudio.collections.deleteEmpty(); await loadCollections(); }}>{t("management.deleteEmptyCollections")}</button>
        </div>
        {tags.slice(0, 4).map((tag) => (
          <div className="management-row" key={tag.id}>
            <span>{tag.name} · {format.number(tag.assetCount)}</span>
            <button className="secondary-button compact" type="button" onClick={() => renameTag(tag)}>{t("management.rename")}</button>
          </div>
        ))}
        {collections.slice(0, 4).map((collection) => (
          <div className="management-row" key={collection.id}>
            <span>{collection.name} · {format.number(collection.assetCount)}</span>
            <button className="secondary-button compact" type="button" onClick={() => renameCollection(collection)}>{t("management.rename")}</button>
          </div>
        ))}
      </section>

      <section className="management-section">
        <h3>{t("management.importSources")}</h3>
        <div className="management-actions">
          <button className="secondary-button compact" type="button" onClick={() => void runTask(t("common.refresh"), loadImportSources)}>{t("common.refresh")}</button>
          <button className="secondary-button compact" type="button" onClick={() => void runTask(t("common.add"), addImportSource)}>{t("common.add")}</button>
        </div>
        {importSources.length === 0 ? <EmptyState title={t("management.noImportSources")} /> : null}
        {importSources.map((source) => (
          <div className="management-row" key={source.id}>
            <span title={source.path}>{source.path}</span>
            <button className="secondary-button compact" type="button" onClick={() => scanImportSource(source.id)}>{t("management.scan")}</button>
            <button className="secondary-button compact" type="button" onClick={() => window.suwolAudio.importSources.importNew(source.id)}>{t("import.action")}</button>
          </div>
        ))}
        {lastScan ? <p className="muted">{t("management.scanSummary", { fresh: format.number(lastScan.newFiles.length), duplicates: format.number(lastScan.duplicateFiles.length) })}</p> : null}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
