import { pathToFileURL } from "node:url";
import { BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from "electron";
import type {
  AssetListQuery,
  AssetUpdateInput,
  DuplicateMergeInput,
  ImportMode,
  MetadataExportOptions,
  PlaybackSupportUpdateInput,
  RelinkCandidate,
} from "../../shared/library-types";
import type { FeatureRerunBatchInput, SimilaritySearchInput } from "../../shared/audio-feature-types";
import type {
  AssetRightsInput,
  CodexInstructionPreviewInput,
  ExportOptions,
  ExportPresetInput,
  ManifestPreviewInput,
} from "../../shared/export-types";
import type { Locale } from "../../shared/i18n/locales";
import type { QuickPreviewSettingsInput } from "../../shared/settings-types";
import { tMain } from "../i18n/main-i18n";
import { formatRendererErrorForLog, type RendererErrorLogInput } from "../services/error-service";
import type { AppServices } from "../services/app-services";
import { SUPPORTED_IMPORT_EXTENSIONS } from "../services/import-service";

export function registerIpcHandlers(
  services: AppServices,
  getWindow: () => BrowserWindow | null,
  onLocaleChanged: () => Promise<void>,
): void {
  ipcMain.handle("library:create", async (_event, options?: { rootPath?: string; name?: string }) => {
    const rootPath = options?.rootPath ?? (await pickDirectory(services, getWindow(), true));
    if (!rootPath) {
      return null;
    }
    return services.libraryService.createLibrary(rootPath, options?.name);
  });

  ipcMain.handle("library:open", async (_event, options?: { rootPath?: string }) => {
    const rootPath = options?.rootPath ?? (await pickDirectory(services, getWindow(), false));
    if (!rootPath) {
      return null;
    }
    return services.libraryService.openLibrary(rootPath);
  });

  ipcMain.handle("library:recent:list", () => services.libraryService.listRecentLibraries());
  ipcMain.handle("library:backupPreview", async (_event, options?: { destinationPath?: string }) => {
    const destinationPath = options?.destinationPath ?? (await pickDirectory(services, getWindow(), true));
    return destinationPath ? services.libraryManagementService.backupPreview(destinationPath) : null;
  });
  ipcMain.handle("library:backupStart", async (_event, options?: { destinationPath?: string }) => {
    const destinationPath = options?.destinationPath ?? (await pickDirectory(services, getWindow(), true));
    return destinationPath ? services.libraryManagementService.backupStart(destinationPath) : null;
  });
  ipcMain.handle("library:restorePreview", async (_event, options?: { sourcePath?: string }) => {
    const sourcePath = options?.sourcePath ?? (await pickDirectory(services, getWindow(), false));
    return sourcePath ? services.libraryManagementService.restorePreview(sourcePath) : null;
  });
  ipcMain.handle(
    "library:exportMetadata",
    async (_event, options?: Partial<MetadataExportOptions> & { outputPath?: string }) => {
      const outputPath = options?.outputPath ?? (await pickDirectory(services, getWindow(), true));
      return outputPath ? services.libraryManagementService.exportMetadata(options ?? {}, outputPath) : null;
    },
  );

  ipcMain.handle(
    "assets:importFiles",
    async (_event, options?: { filePaths?: string[]; importMode?: ImportMode }) => {
      const filePaths = options?.filePaths ?? (await pickImportFiles(services, getWindow()));
      return services.importService.importFiles(filePaths, options?.importMode ?? "copy");
    },
  );

  ipcMain.handle("assets:list", (_event, query?: AssetListQuery) => services.assetService.listAssetPage(query));
  ipcMain.handle("assets:get", (_event, assetId: string) => services.assetService.getAsset(assetId));
  ipcMain.handle("assets:update", (_event, assetId: string, input: AssetUpdateInput) =>
    services.assetService.updateAsset(assetId, input),
  );
  ipcMain.handle("assets:quickTag", (_event, input: { assetId: string; tagName: string }) =>
    services.tagService.applyToAssets({ assetIds: [input.assetId], tagNames: [input.tagName] }),
  );
  ipcMain.handle("assets:batchQuickTag", (_event, input: { assetIds: string[]; tagName: string }) =>
    services.tagService.applyToAssets({ assetIds: input.assetIds, tagNames: [input.tagName] }),
  );
  ipcMain.handle("assets:trash", (_event, assetIds: string[]) => services.trashService.trash(assetIds));
  ipcMain.handle("assets:restore", (_event, assetIds: string[]) => services.trashService.restore(assetIds));
  ipcMain.handle("assets:deletePermanent", (_event, assetIds: string[]) =>
    services.permanentDeleteService.deletePermanent(assetIds),
  );
  ipcMain.handle("assets:listMissing", () => services.libraryManagementService.listMissingFiles());
  ipcMain.handle(
    "assets:relink",
    async (_event, input: { assetId: string; newPath?: string; copyIntoLibrary?: boolean }) => {
      const newPath = input.newPath ?? (await pickSingleFile(getWindow()));
      return newPath
        ? services.libraryManagementService.relinkAsset(input.assetId, newPath, input.copyIntoLibrary)
        : null;
    },
  );
  ipcMain.handle("assets:bulkRelinkPreview", async (_event, input?: { baseFolder?: string }) => {
    const baseFolder = input?.baseFolder ?? (await pickDirectory(services, getWindow(), false));
    return baseFolder ? services.libraryManagementService.bulkRelinkPreview(baseFolder) : null;
  });
  ipcMain.handle(
    "assets:bulkRelinkApply",
    (_event, input: { candidates: RelinkCandidate[]; copyIntoLibrary?: boolean }) =>
      services.libraryManagementService.bulkRelinkApply(input.candidates, input.copyIntoLibrary),
  );
  ipcMain.handle("assets:exportSidecars", (_event, input: { assetIds: string[]; overwrite?: boolean }) =>
    services.libraryManagementService.exportSidecars(input.assetIds, input.overwrite),
  );

  ipcMain.handle("tags:list", () => services.tagService.listTags());
  ipcMain.handle("tags:listWithUsage", () => services.tagService.listTagsWithUsage());
  ipcMain.handle("tags:create", (_event, input: { name: string; color?: string }) => services.tagService.createTag(input));
  ipcMain.handle("tags:rename", (_event, input: { tagId: string; name: string; color?: string }) =>
    services.tagService.renameTag(input),
  );
  ipcMain.handle("tags:merge", (_event, input: { sourceTagIds: string[]; targetTagId: string }) =>
    services.tagService.mergeTags(input),
  );
  ipcMain.handle("tags:delete", (_event, tagIds: string[]) => services.tagService.deleteTags(tagIds));
  ipcMain.handle("tags:deleteUnused", () => services.tagService.deleteUnusedTags());
  ipcMain.handle("tags:applyToAssets", (_event, input: { assetIds: string[]; tagNames: string[] }) =>
    services.tagService.applyToAssets(input),
  );
  ipcMain.handle("tags:removeFromAssets", (_event, input: { assetIds: string[]; tagIds: string[] }) =>
    services.tagService.removeFromAssets(input),
  );

  ipcMain.handle("collections:list", () => services.collectionService.listCollections());
  ipcMain.handle("collections:listWithUsage", () => services.collectionService.listCollectionsWithUsage());
  ipcMain.handle("collections:create", (_event, input: { name: string; description?: string }) =>
    services.collectionService.createCollection(input),
  );
  ipcMain.handle("collections:rename", (_event, input: { collectionId: string; name: string }) =>
    services.collectionService.renameCollection(input),
  );
  ipcMain.handle("collections:updateDescription", (_event, input: { collectionId: string; description: string }) =>
    services.collectionService.updateDescription(input),
  );
  ipcMain.handle("collections:delete", (_event, collectionIds: string[]) =>
    services.collectionService.deleteCollections(collectionIds),
  );
  ipcMain.handle("collections:deleteEmpty", () => services.collectionService.deleteEmptyCollections());
  ipcMain.handle("collections:addAssets", (_event, input: { collectionId: string; assetIds: string[] }) =>
    services.collectionService.addAssets(input),
  );
  ipcMain.handle("collections:removeAssets", (_event, input: { collectionId: string; assetIds: string[] }) =>
    services.collectionService.removeAssets(input),
  );

  ipcMain.handle("analysis:get", (_event, assetId: string) => services.analysisService.get(assetId));
  ipcMain.handle("analysis:rerun", (_event, assetId: string) => services.analysisService.rerun(assetId));
  ipcMain.handle("analysis:features:get", (_event, assetId: string) => services.audioFeatureService.get(assetId));
  ipcMain.handle("analysis:features:rerun", (_event, assetId: string) => services.audioFeatureService.rerun(assetId));
  ipcMain.handle("analysis:features:rerunBatch", (_event, input?: FeatureRerunBatchInput) => services.audioFeatureService.rerunBatch(input));
  ipcMain.handle("analysis:applySuggestedTags", (_event, input: { assetId: string; tagNames: string[]; locale?: Locale }) =>
    services.analysisService.applySuggestedTags(input.assetId, input.tagNames, input.locale),
  );

  ipcMain.handle("similarity:findForAsset", (_event, input: SimilaritySearchInput) =>
    services.audioSimilarityService.findForAsset(input),
  );
  ipcMain.handle("similarity:explain", (_event, input: { assetId: string; candidateAssetId: string }) =>
    services.audioSimilarityService.explain(input.assetId, input.candidateAssetId),
  );

  ipcMain.handle("audio:getPlaybackUrl", async (_event, assetId: string) => {
    const asset = await services.assetService.getAsset(assetId);
    if (!asset || !asset.playable) {
      return null;
    }
    return pathToFileURL(services.assetService.getAssetFilePath(asset)).toString();
  });

  ipcMain.handle("playback:recordPlayed", (_event, assetId: string) => services.assetService.recordPlayed(assetId));
  ipcMain.handle("playback:updateSupportState", (_event, assetId: string, input: PlaybackSupportUpdateInput) =>
    services.assetService.updatePlaybackSupportState(assetId, input),
  );

  ipcMain.handle("settings:get", () => services.settingsService.read());
  ipcMain.handle("settings:setLocale", async (_event, locale: Locale) => {
    const settings = await services.settingsService.setLocale(locale);
    await onLocaleChanged();
    return settings;
  });
  ipcMain.handle("settings:updateQuickPreview", (_event, input: QuickPreviewSettingsInput) =>
    services.settingsService.updateQuickPreview(input),
  );

  ipcMain.handle("diagnostics:runLibrary", () => services.diagnosticsService.runLibraryDiagnostics());
  ipcMain.handle("diagnostics:openLogFolder", async () => {
    await shell.openPath(services.loggerService.getLogDirectory());
    return services.loggerService.getLogDirectory();
  });
  ipcMain.handle("diagnostics:recentLogs", (_event, limit?: number) => services.loggerService.readRecentLines(limit));
  ipcMain.handle("diagnostics:logRendererError", async (_event, input: RendererErrorLogInput) => {
    await services.loggerService.error(formatRendererErrorForLog(input));
    return true;
  });

  ipcMain.handle("duplicates:listGroups", () => services.duplicateService.listGroups());
  ipcMain.handle("duplicates:mergeMetadata", (_event, input: DuplicateMergeInput) =>
    services.duplicateService.mergeMetadata(input),
  );
  ipcMain.handle("duplicates:trashDuplicates", (_event, input: { keepAssetId: string; duplicateAssetIds: string[] }) =>
    services.duplicateService.trashDuplicates(input),
  );
  ipcMain.handle("duplicates:ignoreGroup", (_event, contentHash: string) => services.duplicateService.ignoreGroup(contentHash));

  ipcMain.handle("importSources:list", () => services.libraryManagementService.listImportSources());
  ipcMain.handle("importSources:add", async (_event, input?: { path?: string; importMode?: ImportMode }) => {
    const path = input?.path ?? (await pickDirectory(services, getWindow(), false));
    return path ? services.libraryManagementService.addImportSource(path, input?.importMode ?? "copy") : null;
  });
  ipcMain.handle("importSources:scan", (_event, sourceId: string) =>
    services.libraryManagementService.scanImportSource(sourceId),
  );
  ipcMain.handle("importSources:importNew", (_event, sourceId: string) =>
    services.libraryManagementService.importNewFromSource(sourceId),
  );

  ipcMain.handle("export:preview", (_event, input: Partial<ExportOptions> & { outputPath?: string }) =>
    services.exportCenterService.preview(input, input.outputPath),
  );
  ipcMain.handle("export:run", async (_event, input: Partial<ExportOptions> & { outputPath?: string }) => {
    const outputPath = input.outputPath ?? (await pickExportDirectory(getWindow()));
    return outputPath ? services.exportCenterService.run(input, outputPath) : null;
  });
  ipcMain.handle("export:presets:list", () => services.exportCenterService.listPresets());
  ipcMain.handle("export:presets:save", (_event, input: ExportPresetInput) =>
    services.exportCenterService.savePreset(input),
  );
  ipcMain.handle("export:presets:delete", (_event, presetId: string) =>
    services.exportCenterService.deletePreset(presetId),
  );
  ipcMain.handle("export:showOutputPath", async (_event, path: string) => {
    shell.showItemInFolder(path);
    return true;
  });

  ipcMain.handle("rights:get", (_event, assetId: string) => services.exportCenterService.getRights(assetId));
  ipcMain.handle("rights:update", (_event, assetId: string, input: AssetRightsInput) =>
    services.exportCenterService.updateRights(assetId, input),
  );
  ipcMain.handle("rights:batchUpdate", (_event, input: { assetIds: string[]; rights: AssetRightsInput }) =>
    services.exportCenterService.batchUpdateRights(input.assetIds, input.rights),
  );

  ipcMain.handle("codex:previewInstruction", (_event, input: CodexInstructionPreviewInput) =>
    services.exportCenterService.previewCodexInstruction(input),
  );
  ipcMain.handle("manifest:preview", (_event, input: ManifestPreviewInput) =>
    services.exportCenterService.previewManifest(input),
  );
}

async function pickDirectory(services: AppServices, window: BrowserWindow | null, create: boolean): Promise<string | null> {
  const locale = (await services.settingsService.read()).locale;
  const properties: OpenDialogOptions["properties"] = create ? ["openDirectory", "createDirectory"] : ["openDirectory"];
  const options: OpenDialogOptions = {
    title: create ? tMain(locale, "dialog.libraryCreate") : tMain(locale, "dialog.libraryOpen"),
    properties,
  };
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0] ?? null;
}

async function pickImportFiles(services: AppServices, window: BrowserWindow | null): Promise<string[]> {
  const locale = (await services.settingsService.read()).locale;
  const options: OpenDialogOptions = {
    title: tMain(locale, "dialog.importFiles"),
    properties: ["openFile", "multiSelections"],
    filters: [
      {
        name: tMain(locale, "dialog.assetFilterName"),
        extensions: Array.from(SUPPORTED_IMPORT_EXTENSIONS),
      },
    ],
  };
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
  return result.canceled ? [] : result.filePaths;
}

async function pickSingleFile(window: BrowserWindow | null): Promise<string | null> {
  const options: OpenDialogOptions = {
    properties: ["openFile"],
  };
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
  return result.canceled ? null : result.filePaths[0] ?? null;
}

async function pickExportDirectory(window: BrowserWindow | null): Promise<string | null> {
  const options: OpenDialogOptions = {
    title: "Export",
    properties: ["openDirectory", "createDirectory"],
  };
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
  return result.canceled ? null : result.filePaths[0] ?? null;
}
