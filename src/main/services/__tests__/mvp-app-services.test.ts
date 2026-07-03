import { access, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AnalysisAppService } from "../analysis-app-service";
import { AudioFeatureService } from "../audio-feature-service";
import { AssetService } from "../asset-service";
import { CollectionService } from "../collection-service";
import { ImportService } from "../import-service";
import { LibraryService } from "../library-service";
import { PermanentDeleteService } from "../permanent-delete-service";
import { TagService } from "../tag-service";
import { TrashService } from "../trash-service";

describe("mvp app services", () => {
  it("creates and reopens a migrated library", async () => {
    const { libraryService, rootPath } = await createTestServices();
    const snapshot = await libraryService.snapshot();

    expect(snapshot.library.rootPath).toBe(rootPath);
    await expect(access(snapshot.library.databasePath)).resolves.toBeUndefined();

    libraryService.closeActive();
    const reopened = await libraryService.openLibrary(rootPath);
    expect(reopened.library.id).toBe(snapshot.library.id);
    expect(await libraryService.listRecentLibraries()).toHaveLength(1);

    const columns = libraryService
      .requireActive()
      .db.all<{ name: string }>("PRAGMA table_info(assets)")
      .map((column) => column.name);
    expect(columns).toEqual(
      expect.arrayContaining(["last_played_at", "play_count", "playback_supported", "playback_error_code"]),
    );
    const featureTable = libraryService
      .requireActive()
      .db.get<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'asset_audio_features'");
    expect(featureTable?.name).toBe("asset_audio_features");
  });

  it("creates a library under a Korean and spaced path", async () => {
    const rootPath = join(tmpdir(), `수월 오디오 ${crypto.randomUUID()}`, "라이브러리 폴더");
    const libraryService = new LibraryService(join(rootPath, "..", "app-data", "recent.json"));
    const snapshot = await libraryService.createLibrary(rootPath);

    expect(snapshot.library.rootPath).toBe(rootPath);
    await expect(access(snapshot.library.databasePath)).resolves.toBeUndefined();
    libraryService.closeActive();
  });

  it("imports an asset, stores analysis, and skips duplicate content hashes", async () => {
    const services = await createTestServices();
    const wavPath = join(services.sourcePath, "ui_click.wav");
    await writeFile(wavPath, createSilentWav());

    const first = await services.importService.importFiles([wavPath]);
    const second = await services.importService.importFiles([wavPath]);
    const assets = await services.assetService.listAssets();

    expect(first.success).toBe(1);
    expect(first.summary).toMatchObject({ requested: 1, success: 1, duplicateSkipped: 0, unsupportedSkipped: 0 });
    expect(first.importedAssetIds).toHaveLength(1);
    expect(second.skipped).toBe(1);
    expect(second.summary.duplicateSkipped).toBe(1);
    expect(assets).toHaveLength(1);
    expect(assets[0]?.audioAnalysis?.classification.map((candidate) => candidate.type)).toContain("ui_sound");
    expect(assets[0]?.audioFeatures?.featureVector.every(Number.isFinite)).toBe(true);
  });

  it("reports unsupported imports without failing the batch", async () => {
    const services = await createTestServices();
    const exePath = join(services.sourcePath, "unsupported.exe");
    await writeFile(exePath, Buffer.from("MZ", "ascii"));

    const result = await services.importService.importFiles([exePath]);

    expect(result).toMatchObject({ requested: 1, success: 0, failed: 0, skipped: 1 });
    expect(result.summary.unsupportedSkipped).toBe(1);
  });

  it("keeps imported assets when analysis fails", async () => {
    const services = await createTestServices();
    const wavPath = join(services.sourcePath, "analysis_fail.wav");
    await writeFile(wavPath, createSilentWav());
    const failingImportService = new ImportService(services.libraryService, {
      rerun: async () => {
        throw new Error("forced analysis failure");
      },
    } as unknown as AnalysisAppService);

    const result = await failingImportService.importFiles([wavPath]);
    const assets = await services.assetService.listAssets();

    expect(result.success).toBe(1);
    expect(result.summary.analysisFailed).toBe(1);
    expect(assets).toHaveLength(1);
  });

  it("records recent playback with debounce and smart-folder filtering", async () => {
    const services = await createTestServices();
    const wavPath = join(services.sourcePath, "played_click.wav");
    await writeFile(wavPath, createSilentWav());
    await services.importService.importFiles([wavPath]);
    const asset = (await services.assetService.listAssets())[0];

    expect(asset).toBeDefined();
    await services.assetService.recordPlayed(asset!.id, new Date("2026-01-01T00:00:00.000Z"));
    await services.assetService.recordPlayed(asset!.id, new Date("2026-01-01T00:00:01.000Z"));
    await services.assetService.recordPlayed(asset!.id, new Date("2026-01-01T00:00:03.000Z"));

    const updated = await services.assetService.getAsset(asset!.id);
    const recentPlayed = await services.assetService.listAssets({ smartFolder: "recentPlayed", sort: "lastPlayedDesc" });

    expect(updated?.playCount).toBe(2);
    expect(updated?.lastPlayedAt).toBe("2026-01-01T00:00:03.000Z");
    expect(recentPlayed.map((item) => item.id)).toEqual([asset!.id]);
  });

  it("marks browser playback failures as unplayable without deleting the asset", async () => {
    const services = await createTestServices();
    const wavPath = join(services.sourcePath, "codec_problem.wav");
    await writeFile(wavPath, createSilentWav());
    await services.importService.importFiles([wavPath]);
    const asset = (await services.assetService.listAssets())[0];

    expect(asset?.playable).toBe(true);
    await services.assetService.updatePlaybackSupportState(asset!.id, {
      supported: false,
      errorCode: "HTML_AUDIO_ERROR",
    });

    const updated = await services.assetService.getAsset(asset!.id);
    const unplayable = await services.assetService.listAssets({ smartFolder: "unplayable" });

    expect(updated?.playable).toBe(false);
    expect(updated?.playbackSupportReason).toBe("HTML_AUDIO_ERROR");
    expect(unplayable.map((item) => item.id)).toEqual([asset!.id]);
  });

  it("reuses tags when applying selected analysis suggestions", async () => {
    const services = await createTestServices();
    const wavPath = join(services.sourcePath, "ui_click.wav");
    await writeFile(wavPath, createSilentWav());
    await services.importService.importFiles([wavPath]);
    const asset = (await services.assetService.listAssets())[0];

    expect(asset).toBeDefined();
    const first = await services.analysisService.applySuggestedTags(asset!.id, ["UI사운드", "클릭"]);
    const second = await services.analysisService.applySuggestedTags(asset!.id, ["UI사운드", "클릭"]);
    const updated = await services.assetService.getAsset(asset!.id);

    expect(first.applied.map((tag) => tag.name).sort()).toEqual(["UI사운드", "클릭"].sort());
    expect(second.alreadyLinked.map((tag) => tag.name).sort()).toEqual(["UI사운드", "클릭"].sort());
    expect(updated?.tags.map((tag) => tag.name).sort()).toEqual(["UI사운드", "클릭"].sort());
  });

  it("applies suggested tag labels in the selected locale", async () => {
    const services = await createTestServices();
    const wavPath = join(services.sourcePath, "ui_click.wav");
    await writeFile(wavPath, createSilentWav());
    await services.importService.importFiles([wavPath]);
    const asset = (await services.assetService.listAssets())[0];

    expect(asset).toBeDefined();
    await services.analysisService.applySuggestedTags(asset!.id, ["UI Sound", "Click"], "en");
    const updated = await services.assetService.getAsset(asset!.id);

    expect(updated?.tags.map((tag) => tag.name).sort()).toEqual(["Click", "UI Sound"].sort());
  });

  it("handles collections, trash, restore, and permanent delete batch results", async () => {
    const services = await createTestServices();
    const wavPath = join(services.sourcePath, "ambience_loop.wav");
    await writeFile(wavPath, createSilentWav());
    await services.importService.importFiles([wavPath]);
    const asset = (await services.assetService.listAssets())[0];
    const collection = await services.collectionService.createCollection({ name: "프로젝트 A" });

    expect(asset).toBeDefined();
    const addResult = await services.collectionService.addAssets({ collectionId: collection.id, assetIds: [asset!.id] });
    expect(addResult).toMatchObject({ requested: 1, success: 1, failed: 0, skipped: 0 });
    expect((await services.assetService.getAsset(asset!.id))?.collections.map((item) => item.name)).toEqual(["프로젝트 A"]);

    const trashResult = await services.trashService.trash([asset!.id]);
    expect(trashResult.success).toBe(1);
    expect((await services.assetService.listAssets({ onlyTrashed: true }))).toHaveLength(1);

    const restoreResult = await services.trashService.restore([asset!.id]);
    expect(restoreResult.success).toBe(1);
    expect((await services.assetService.listAssets({ onlyTrashed: true }))).toHaveLength(0);

    await services.trashService.trash([asset!.id]);
    const deleteResult = await services.permanentDeleteService.deletePermanent([asset!.id]);
    expect(deleteResult).toMatchObject({ requested: 1, success: 1, failed: 0, skipped: 0 });
    expect(await services.assetService.getAsset(asset!.id)).toBeNull();
  });

  it("deletes copy-mode internal files but never deletes linked originals", async () => {
    const services = await createTestServices();
    const copyPath = join(services.sourcePath, "copy_delete.wav");
    const linkPath = join(services.sourcePath, "link_delete.wav");
    await writeFile(copyPath, createSilentWav());
    const linkBuffer = createSilentWav();
    linkBuffer[linkBuffer.length - 1] = 1;
    await writeFile(linkPath, linkBuffer);

    await services.importService.importFiles([copyPath], "copy");
    await services.importService.importFiles([linkPath], "link");
    const assets = await services.assetService.listAssets();
    const copyAsset = assets.find((asset) => asset.importMode === "copy");
    const linkAsset = assets.find((asset) => asset.importMode === "link");

    expect(copyAsset?.storedPath).toBeTruthy();
    await services.trashService.trash([copyAsset!.id, linkAsset!.id]);
    const result = await services.permanentDeleteService.deletePermanent([copyAsset!.id, linkAsset!.id]);

    expect(result.success).toBe(2);
    await expect(access(copyAsset!.storedPath!)).rejects.toThrow();
    await expect(access(linkPath)).resolves.toBeUndefined();
  });

  it("keeps DB records when permanent delete safety check fails", async () => {
    const services = await createTestServices();
    const wavPath = join(services.sourcePath, "unsafe_delete.wav");
    await writeFile(wavPath, createSilentWav());
    await services.importService.importFiles([wavPath], "copy");
    const asset = (await services.assetService.listAssets())[0];
    const context = services.libraryService.requireActive();
    context.db.run("UPDATE assets SET stored_path = ? WHERE id = ?", [wavPath, asset!.id]);

    await services.trashService.trash([asset!.id]);
    const result = await services.permanentDeleteService.deletePermanent([asset!.id]);

    expect(result.failed).toBe(1);
    expect(await services.assetService.getAsset(asset!.id)).not.toBeNull();
  });
});

async function createTestServices(): Promise<{
  rootPath: string;
  sourcePath: string;
  libraryService: LibraryService;
  assetService: AssetService;
  tagService: TagService;
  collectionService: CollectionService;
  analysisService: AnalysisAppService;
  audioFeatureService: AudioFeatureService;
  importService: ImportService;
  trashService: TrashService;
  permanentDeleteService: PermanentDeleteService;
}> {
  const rootPath = join(tmpdir(), `suwol-audio-reference-${crypto.randomUUID()}`);
  const sourcePath = join(rootPath, "source");
  await mkdir(sourcePath, { recursive: true });

  const libraryService = new LibraryService(join(rootPath, "app-data", "recent.json"));
  await libraryService.createLibrary(join(rootPath, "library"));
  const assetService = new AssetService(libraryService);
  const tagService = new TagService(libraryService);
  const collectionService = new CollectionService(libraryService);
  const analysisService = new AnalysisAppService(libraryService, assetService, tagService);
  const audioFeatureService = new AudioFeatureService(libraryService, assetService, analysisService);
  analysisService.setFeatureService(audioFeatureService);
  const importService = new ImportService(libraryService, analysisService);
  const trashService = new TrashService(libraryService);
  const permanentDeleteService = new PermanentDeleteService(libraryService, assetService);

  return {
    rootPath: join(rootPath, "library"),
    sourcePath,
    libraryService,
    assetService,
    tagService,
    collectionService,
    analysisService,
    audioFeatureService,
    importService,
    trashService,
    permanentDeleteService,
  };
}

function createSilentWav(): Buffer {
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
  return buffer;
}
