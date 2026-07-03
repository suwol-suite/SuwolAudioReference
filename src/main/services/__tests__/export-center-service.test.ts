import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AssetListItem } from "../../../shared/library-types";
import { CodexInstructionExportService } from "../codex-instruction-export-service";
import { ExportCenterService } from "../export-center-service";
import { GameAudioManifestService, safeFileName, sanitizeEngineKey } from "../game-audio-manifest-service";
import { AnalysisAppService } from "../analysis-app-service";
import { AssetService } from "../asset-service";
import { ImportService } from "../import-service";
import { LibraryService } from "../library-service";
import { TagService } from "../tag-service";

describe("export center services", () => {
  it("sanitizes engine keys and suffixes duplicate keys", () => {
    const manifestService = new GameAudioManifestService();
    const contexts = manifestService.createContexts(
      [fakeAsset("Button Click!.wav"), fakeAsset("Button Click!.mp3", "asset-2")],
      new Map(),
    );

    expect(sanitizeEngineKey("01 Button Click!.wav")).toBe("audio_01_button_click");
    expect(safeFileName("bad<> name.wav")).toBe("bad_name.wav");
    expect(contexts.map((context) => context.engineKey)).toEqual(["button_click", "button_click_2"]);
  });

  it("generates generic, Unity, Unreal CSV, and MonoGame content outputs", () => {
    const manifestService = new GameAudioManifestService();
    const asset = fakeAsset("button_click.wav");
    const contexts = manifestService.createContexts([asset], new Map());
    const library = {
      id: "library",
      name: "Game Audio",
      rootPath: "library",
      databasePath: "library.sqlite",
      assetsPath: "assets",
      createdAt: "",
      updatedAt: "",
      lastOpenedAt: "",
    };

    const generic = manifestService.createGenericManifest(library, { type: "selected", assetIds: [asset.id] }, "selected", contexts, {
      includeCollections: true,
      includeMemo: true,
      includeRights: true,
    });
    const unity = manifestService.createUnityManifest(contexts);
    const unrealCsv = manifestService.createUnrealCsv(contexts);
    const monoGameContent = manifestService.createMonoGameContentList(contexts);

    expect(JSON.stringify(generic)).toContain("manifestVersion");
    expect(JSON.stringify(unity)).toContain("Assets/Audio/ui/button_click.wav");
    expect(unrealCsv).toContain("Key,FileName,RelativePath");
    expect(monoGameContent).toContain("#begin ui/button_click.wav");
  });

  it("generates Codex Markdown and JSON context without calling external APIs", () => {
    const manifestService = new GameAudioManifestService();
    const codexService = new CodexInstructionExportService();
    const asset = fakeAsset("battle_loop.wav");
    const contexts = manifestService.createContexts([asset], new Map());
    const library = {
      id: "library",
      name: "Game Audio",
      rootPath: "library",
      databasePath: "library.sqlite",
      assetsPath: "assets",
      createdAt: "",
      updatedAt: "",
      lastOpenedAt: "",
    };

    const markdown = codexService.createMarkdown(library, { type: "selected", assetIds: [asset.id] }, "selected", contexts, {
      goal: "Create a Unity import plan.",
      template: "unity_import_plan",
      includeAbsolutePaths: false,
      includeRights: true,
    });
    const json = codexService.createJsonContext(library, { type: "selected", assetIds: [asset.id] }, "selected", contexts, {
      goal: "Create a Unity import plan.",
      template: "unity_import_plan",
      includeAbsolutePaths: false,
      includeRights: true,
    });

    expect(markdown).toContain("# Suwol Audio Reference Export");
    expect(markdown).toContain("Do not modify the original audio files");
    expect(JSON.stringify(json)).toContain("unity_import_plan");
  });

  it("saves rights metadata and warns for missing license, missing files, credit, and absolute paths", async () => {
    const services = await createServices();
    const source = join(services.sourcePath, "rights.wav");
    await writeFile(source, createSilentWav(1));
    await services.importService.importFiles([source], "copy");
    const asset = (await services.assetService.listAssets())[0]!;

    let preview = await services.exportService.preview({
      target: "generic_manifest",
      source: { type: "selected", assetIds: [asset.id] },
      includeRights: true,
    });
    expect(preview.issues.some((issue) => issue.code === "UNKNOWN_LICENSE")).toBe(true);

    const rights = await services.exportService.updateRights(asset.id, {
      licenseName: "Custom",
      commercialUseStatus: "allowed",
      creditRequired: "yes",
    });
    preview = await services.exportService.preview({
      target: "generic_manifest",
      source: { type: "selected", assetIds: [asset.id] },
      includeRights: true,
      includeAbsolutePaths: true,
    });
    expect(rights.licenseName).toBe("Custom");
    expect(preview.issues.some((issue) => issue.code === "CREDIT_MISSING")).toBe(true);
    expect(preview.issues.some((issue) => issue.code === "ABSOLUTE_PATH_INCLUDED")).toBe(true);

    await rm(asset.storedPath!);
    preview = await services.exportService.preview({
      target: "generic_manifest",
      source: { type: "selected", assetIds: [asset.id] },
      includeRights: false,
    });
    expect(preview.ok).toBe(false);
    expect(preview.issues.some((issue) => issue.code === "MISSING_FILE")).toBe(true);
  });

  it("runs manifest, sound pack, and preset workflows with summary counts", async () => {
    const services = await createServices();
    const source = join(services.sourcePath, "ui_export.wav");
    await writeFile(source, createSilentWav(2));
    await services.importService.importFiles([source], "copy");
    const asset = (await services.assetService.listAssets())[0]!;
    await services.exportService.updateRights(asset.id, {
      licenseName: "Custom",
      commercialUseStatus: "allowed",
      creditRequired: "no",
    });

    const manifestRoot = join(services.rootPath, "manifest-export");
    const packRoot = join(services.rootPath, "pack-export");
    await mkdir(manifestRoot, { recursive: true });
    await mkdir(packRoot, { recursive: true });

    const manifest = await services.exportService.run(
      {
        target: "generic_manifest",
        source: { type: "selected", assetIds: [asset.id] },
        includeRights: true,
        acknowledgeWarnings: true,
      },
      manifestRoot,
    );
    const pack = await services.exportService.run(
      {
        target: "sound_pack_folder",
        source: { type: "selected", assetIds: [asset.id] },
        includeRights: true,
        copyAudioFiles: true,
        soundPackName: "test-pack",
        acknowledgeWarnings: true,
      },
      packRoot,
    );
    const preset = services.exportService.savePreset({
      name: "Test Manifest",
      type: "generic_manifest",
      config: { target: "generic_manifest" },
    });
    const presets = services.exportService.listPresets();
    const deleted = services.exportService.deletePreset(preset.id);

    expect(manifest.ok).toBe(true);
    expect(manifest.summary).toMatchObject({ requested: 1, exported: 1, failed: 0 });
    expect(await readFile(manifest.outputPath!, "utf8")).toContain("manifestVersion");
    expect(pack.ok).toBe(true);
    expect(pack.files.some((file) => file.endsWith("manifest.json"))).toBe(true);
    await expect(access(join(packRoot, "test-pack", "audio", "ui", "ui_export.wav"))).resolves.toBeUndefined();
    expect(presets.some((item) => item.id === preset.id)).toBe(true);
    expect(deleted.success).toBe(1);
  });
});

async function createServices() {
  const rootPath = join(tmpdir(), `suwol-audio-export-${crypto.randomUUID()}`);
  const sourcePath = join(rootPath, "source");
  await mkdir(sourcePath, { recursive: true });
  const libraryService = new LibraryService(join(rootPath, "app-data", "recent.json"));
  await libraryService.createLibrary(join(rootPath, "library"));
  const assetService = new AssetService(libraryService);
  const tagService = new TagService(libraryService);
  const analysisService = new AnalysisAppService(libraryService, assetService, tagService);
  const importService = new ImportService(libraryService, analysisService);
  const exportService = new ExportCenterService(libraryService, assetService);
  return { rootPath, sourcePath, libraryService, assetService, importService, exportService };
}

function fakeAsset(fileName: string, id = "asset-1"): AssetListItem {
  return {
    id,
    libraryId: "library",
    originalPath: `C:/Audio/${fileName}`,
    storedPath: `C:/Library/${fileName}`,
    fileName,
    fileExt: fileName.split(".").pop() ?? "wav",
    fileSize: 100,
    contentHash: id,
    importMode: "copy",
    mediaType: "audio",
    title: fileName.replace(/\.[^.]+$/, ""),
    memo: "",
    rating: 3,
    favorite: false,
    trashedAt: null,
    lastPlayedAt: null,
    playCount: 0,
    playbackSupported: null,
    playbackErrorCode: null,
    fileMissing: false,
    fileMissingCheckedAt: null,
    relinkedAt: null,
    createdAt: "",
    updatedAt: "",
    tags: [{ id: "tag-ui", libraryId: "library", name: "UI", color: "#55c7a5", createdAt: "", updatedAt: "" }],
    collections: [{ id: "collection-ui", libraryId: "library", name: "UI Sounds", description: null, createdAt: "", updatedAt: "" }],
    audioAnalysis: {
      durationMs: 320,
      sampleRate: 44100,
      channels: 2,
      bitrate: 1411200,
      format: "wav",
      peakDb: -1,
      rmsDb: -12,
      loopScore: 0.12,
      waveformSummary: {
        sampleRate: 44100,
        channels: 2,
        bucketSize: 512,
        buckets: [{ min: -0.1, max: 0.5, peak: 0.5, rms: 0.12 }],
      },
      classification: [{ type: "ui_sound", confidence: 0.9, reasons: ["keyword"] }],
      suggestedTags: [],
      loopLikelihood: "low",
      analyzerVersion: "test",
      warnings: [],
    },
    playable: true,
    playbackSupportReason: null,
    duplicateCount: 1,
  };
}

function createSilentWav(seed: number): Buffer {
  const sampleRate = 8000;
  const samples = 800;
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);
  buffer[buffer.length - 1] = seed;
  return buffer;
}
