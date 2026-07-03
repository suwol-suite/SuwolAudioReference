import { contextBridge, ipcRenderer } from "electron";
import type { SuwolAudioApi } from "../shared/ipc-types";

const api: SuwolAudioApi = {
  library: {
    create: (options) => ipcRenderer.invoke("library:create", options),
    open: (options) => ipcRenderer.invoke("library:open", options),
    recentList: () => ipcRenderer.invoke("library:recent:list"),
    backupPreview: (options) => ipcRenderer.invoke("library:backupPreview", options),
    backupStart: (options) => ipcRenderer.invoke("library:backupStart", options),
    restorePreview: (options) => ipcRenderer.invoke("library:restorePreview", options),
    exportMetadata: (options) => ipcRenderer.invoke("library:exportMetadata", options),
  },
  assets: {
    importFiles: (options) => ipcRenderer.invoke("assets:importFiles", options),
    list: (query) => ipcRenderer.invoke("assets:list", query),
    get: (assetId) => ipcRenderer.invoke("assets:get", assetId),
    update: (assetId, input) => ipcRenderer.invoke("assets:update", assetId, input),
    quickTag: (input) => ipcRenderer.invoke("assets:quickTag", input),
    batchQuickTag: (input) => ipcRenderer.invoke("assets:batchQuickTag", input),
    trash: (assetIds) => ipcRenderer.invoke("assets:trash", assetIds),
    restore: (assetIds) => ipcRenderer.invoke("assets:restore", assetIds),
    deletePermanent: (assetIds) => ipcRenderer.invoke("assets:deletePermanent", assetIds),
    listMissing: () => ipcRenderer.invoke("assets:listMissing"),
    relink: (input) => ipcRenderer.invoke("assets:relink", input),
    bulkRelinkPreview: (input) => ipcRenderer.invoke("assets:bulkRelinkPreview", input),
    bulkRelinkApply: (input) => ipcRenderer.invoke("assets:bulkRelinkApply", input),
    exportSidecars: (input) => ipcRenderer.invoke("assets:exportSidecars", input),
  },
  tags: {
    list: () => ipcRenderer.invoke("tags:list"),
    listWithUsage: () => ipcRenderer.invoke("tags:listWithUsage"),
    create: (input) => ipcRenderer.invoke("tags:create", input),
    rename: (input) => ipcRenderer.invoke("tags:rename", input),
    merge: (input) => ipcRenderer.invoke("tags:merge", input),
    delete: (tagIds) => ipcRenderer.invoke("tags:delete", tagIds),
    deleteUnused: () => ipcRenderer.invoke("tags:deleteUnused"),
    applyToAssets: (input) => ipcRenderer.invoke("tags:applyToAssets", input),
    removeFromAssets: (input) => ipcRenderer.invoke("tags:removeFromAssets", input),
  },
  collections: {
    list: () => ipcRenderer.invoke("collections:list"),
    listWithUsage: () => ipcRenderer.invoke("collections:listWithUsage"),
    create: (input) => ipcRenderer.invoke("collections:create", input),
    rename: (input) => ipcRenderer.invoke("collections:rename", input),
    updateDescription: (input) => ipcRenderer.invoke("collections:updateDescription", input),
    delete: (collectionIds) => ipcRenderer.invoke("collections:delete", collectionIds),
    deleteEmpty: () => ipcRenderer.invoke("collections:deleteEmpty"),
    addAssets: (input) => ipcRenderer.invoke("collections:addAssets", input),
    removeAssets: (input) => ipcRenderer.invoke("collections:removeAssets", input),
  },
  duplicates: {
    listGroups: () => ipcRenderer.invoke("duplicates:listGroups"),
    mergeMetadata: (input) => ipcRenderer.invoke("duplicates:mergeMetadata", input),
    trashDuplicates: (input) => ipcRenderer.invoke("duplicates:trashDuplicates", input),
    ignoreGroup: (contentHash) => ipcRenderer.invoke("duplicates:ignoreGroup", contentHash),
  },
  importSources: {
    list: () => ipcRenderer.invoke("importSources:list"),
    add: (input) => ipcRenderer.invoke("importSources:add", input),
    scan: (sourceId) => ipcRenderer.invoke("importSources:scan", sourceId),
    importNew: (sourceId) => ipcRenderer.invoke("importSources:importNew", sourceId),
  },
  export: {
    preview: (input) => ipcRenderer.invoke("export:preview", input),
    run: (input) => ipcRenderer.invoke("export:run", input),
    presetsList: () => ipcRenderer.invoke("export:presets:list"),
    presetsSave: (input) => ipcRenderer.invoke("export:presets:save", input),
    presetsDelete: (presetId) => ipcRenderer.invoke("export:presets:delete", presetId),
    showOutputPath: (path) => ipcRenderer.invoke("export:showOutputPath", path),
  },
  rights: {
    get: (assetId) => ipcRenderer.invoke("rights:get", assetId),
    update: (assetId, input) => ipcRenderer.invoke("rights:update", assetId, input),
    batchUpdate: (input) => ipcRenderer.invoke("rights:batchUpdate", input),
  },
  codex: {
    previewInstruction: (input) => ipcRenderer.invoke("codex:previewInstruction", input),
  },
  manifest: {
    preview: (input) => ipcRenderer.invoke("manifest:preview", input),
  },
  analysis: {
    get: (assetId) => ipcRenderer.invoke("analysis:get", assetId),
    rerun: (assetId) => ipcRenderer.invoke("analysis:rerun", assetId),
    featuresGet: (assetId) => ipcRenderer.invoke("analysis:features:get", assetId),
    featuresRerun: (assetId) => ipcRenderer.invoke("analysis:features:rerun", assetId),
    featuresRerunBatch: (input) => ipcRenderer.invoke("analysis:features:rerunBatch", input),
    applySuggestedTags: (input) => ipcRenderer.invoke("analysis:applySuggestedTags", input),
  },
  similarity: {
    findForAsset: (input) => ipcRenderer.invoke("similarity:findForAsset", input),
    explain: (input) => ipcRenderer.invoke("similarity:explain", input),
  },
  audio: {
    getPlaybackUrl: (assetId) => ipcRenderer.invoke("audio:getPlaybackUrl", assetId),
  },
  playback: {
    recordPlayed: (assetId) => ipcRenderer.invoke("playback:recordPlayed", assetId),
    updateSupportState: (assetId, input) => ipcRenderer.invoke("playback:updateSupportState", assetId, input),
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    setLocale: (locale) => ipcRenderer.invoke("settings:setLocale", locale),
    updateQuickPreview: (input) => ipcRenderer.invoke("settings:updateQuickPreview", input),
  },
  diagnostics: {
    runLibraryDiagnostics: () => ipcRenderer.invoke("diagnostics:runLibrary"),
    openLogFolder: () => ipcRenderer.invoke("diagnostics:openLogFolder"),
    recentLogs: (limit) => ipcRenderer.invoke("diagnostics:recentLogs", limit),
    logRendererError: (input) => ipcRenderer.invoke("diagnostics:logRendererError", input),
  },
  menu: {
    onCommand: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, command: "library:create" | "library:open" | "assets:import") => {
        callback(command);
      };
      ipcRenderer.on("menu:command", listener);
      return () => ipcRenderer.removeListener("menu:command", listener);
    },
  },
};

contextBridge.exposeInMainWorld("suwolAudio", api);
