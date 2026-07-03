import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AnalysisAppService } from "../analysis-app-service";
import { AssetService } from "../asset-service";
import { CollectionService } from "../collection-service";
import { DuplicateService } from "../duplicate-service";
import { ImportService } from "../import-service";
import { LibraryManagementService } from "../library-management-service";
import { LibraryService } from "../library-service";
import { TagService } from "../tag-service";
import { TrashService } from "../trash-service";

describe("library-management-service", () => {
  it("detects missing copy files and relinks them by copying into library storage", async () => {
    const services = await createServices();
    const source = join(services.sourcePath, "missing.wav");
    const replacement = join(services.sourcePath, "replacement.wav");
    await writeFile(source, createSilentWav(0));
    await writeFile(replacement, createSilentWav(1));
    await services.importService.importFiles([source], "copy");
    const asset = (await services.assetService.listAssets())[0]!;
    await rm(asset.storedPath!);

    const missing = await services.managementService.listMissingFiles();
    const relinked = await services.managementService.relinkAsset(asset.id, replacement, true);

    expect(missing).toHaveLength(1);
    expect(relinked.copiedIntoLibrary).toBe(true);
    expect(relinked.updatedAsset?.fileMissing).toBe(false);
    await expect(access(relinked.updatedAsset!.storedPath!)).resolves.toBeUndefined();
  });

  it("previews folder relink candidates by name, size, and hash", async () => {
    const services = await createServices();
    const source = join(services.sourcePath, "bulk.wav");
    await writeFile(source, createSilentWav(2));
    await services.importService.importFiles([source], "copy");
    const asset = (await services.assetService.listAssets())[0]!;
    await rm(asset.storedPath!);
    const recovery = join(services.rootPath, "recovery");
    await mkdir(recovery, { recursive: true });
    await writeFile(join(recovery, "bulk.wav"), createSilentWav(2));

    const preview = await services.managementService.bulkRelinkPreview(recovery);

    expect(preview.candidates[0]).toMatchObject({ assetId: asset.id, confidence: "high", hashMatches: true });
  });

  it("exports backup manifests and metadata JSON", async () => {
    const services = await createServices();
    const source = join(services.sourcePath, "export.wav");
    await writeFile(source, createSilentWav(3));
    await services.importService.importFiles([source], "copy");
    const backupRoot = join(services.rootPath, "backups");
    const exportRoot = join(services.rootPath, "exports");

    const backup = await services.managementService.backupStart(backupRoot);
    const exported = await services.managementService.exportMetadata({ format: "json", includePaths: false }, exportRoot);

    expect(backup.manifest.assetCount).toBe(1);
    await expect(access(backup.manifestPath)).resolves.toBeUndefined();
    expect(exported.format).toBe("json");
    expect(await readFile(exported.outputPath, "utf8")).toContain("Suwol Audio Reference");
  });

  it("scans import sources and imports only new files", async () => {
    const services = await createServices();
    const scanRoot = join(services.rootPath, "scan");
    await mkdir(scanRoot, { recursive: true });
    await writeFile(join(scanRoot, "new.wav"), createSilentWav(4));
    await writeFile(join(scanRoot, "unsupported.exe"), Buffer.from("MZ"));
    const source = await services.managementService.addImportSource(scanRoot, "copy");

    const scan = await services.managementService.scanImportSource(source.id);
    const imported = await services.managementService.importNewFromSource(source.id);

    expect(scan.newFiles).toHaveLength(1);
    expect(scan.unsupportedFiles).toHaveLength(1);
    expect(imported.success).toBe(1);
  });

  it("renames, merges, and deletes unused tags and empty collections", async () => {
    const services = await createServices();
    const wav = join(services.sourcePath, "tagged.wav");
    await writeFile(wav, createSilentWav(5));
    await services.importService.importFiles([wav], "copy");
    const asset = (await services.assetService.listAssets())[0]!;
    const keepTag = await services.tagService.createTag({ name: "keep" });
    const mergeTag = await services.tagService.createTag({ name: "merge" });
    await services.tagService.applyToAssets({ assetIds: [asset.id], tagNames: [mergeTag.name] });
    await services.tagService.renameTag({ tagId: keepTag.id, name: "renamed" });
    await services.tagService.mergeTags({ sourceTagIds: [mergeTag.id], targetTagId: keepTag.id });
    const collection = await services.collectionService.createCollection({ name: "empty" });

    const tags = await services.tagService.listTagsWithUsage();
    const deletedCollections = await services.collectionService.deleteEmptyCollections();

    expect(tags.find((tag) => tag.name === "renamed")?.assetCount).toBe(1);
    expect(deletedCollections.success).toBeGreaterThanOrEqual(1);
    expect(collection.id).toBeTruthy();
  });

  it("merges duplicate metadata and moves duplicate records to trash", async () => {
    const services = await createServices();
    const one = join(services.sourcePath, "one.wav");
    await writeFile(one, createSilentWav(6));
    await services.importService.importFiles([one], "copy");
    const keep = (await services.assetService.listAssets())[0]!;
    const context = services.libraryService.requireActive();
    const duplicateId = crypto.randomUUID();
    context.db.run(
      `
      INSERT INTO assets (
        id, library_id, original_path, stored_path, file_name, file_ext, file_size, content_hash,
        import_mode, media_type, title, memo, rating, favorite, trashed_at, last_played_at,
        play_count, playback_supported, playback_error_code, file_missing, file_missing_checked_at,
        relinked_at, created_at, updated_at
      )
      VALUES (?, ?, ?, NULL, ?, 'wav', ?, ?, 'link', 'audio', ?, '', 5, 1, NULL, NULL, 0, NULL, NULL, 0, NULL, NULL, ?, ?)
      `,
      [
        duplicateId,
        keep.libraryId,
        one,
        "duplicate.wav",
        keep.fileSize,
        keep.contentHash,
        "duplicate",
        new Date().toISOString(),
        new Date().toISOString(),
      ],
    );
    await services.tagService.applyToAssets({ assetIds: [duplicateId], tagNames: ["dup-tag"] });

    const groups = await services.duplicateService.listGroups();
    const merge = await services.duplicateService.mergeMetadata({
      contentHash: keep.contentHash,
      keepAssetId: keep.id,
      mergeAssetIds: [duplicateId],
      mergeTags: true,
      mergeCollections: true,
      mergeFavorite: true,
      mergeRating: "highest",
    });
    const trash = await services.duplicateService.trashDuplicates({ keepAssetId: keep.id, duplicateAssetIds: [duplicateId] });
    const updated = await services.assetService.getAsset(keep.id);

    expect(groups).toHaveLength(1);
    expect(merge.success).toBe(1);
    expect(updated?.favorite).toBe(true);
    expect(updated?.rating).toBe(5);
    expect(updated?.tags.map((tag) => tag.name)).toContain("dup-tag");
    expect(trash.success).toBe(1);
  });
});

async function createServices() {
  const rootPath = join(tmpdir(), `suwol-audio-management-${crypto.randomUUID()}`);
  const sourcePath = join(rootPath, "source");
  await mkdir(sourcePath, { recursive: true });
  const libraryService = new LibraryService(join(rootPath, "app-data", "recent.json"));
  await libraryService.createLibrary(join(rootPath, "library"));
  const assetService = new AssetService(libraryService);
  const tagService = new TagService(libraryService);
  const collectionService = new CollectionService(libraryService);
  const analysisService = new AnalysisAppService(libraryService, assetService, tagService);
  const importService = new ImportService(libraryService, analysisService);
  const trashService = new TrashService(libraryService);
  const duplicateService = new DuplicateService(libraryService, assetService, trashService);
  const managementService = new LibraryManagementService(libraryService, assetService, importService);
  return {
    rootPath,
    sourcePath,
    libraryService,
    assetService,
    tagService,
    collectionService,
    importService,
    duplicateService,
    managementService,
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
