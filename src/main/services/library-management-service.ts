import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import type {
  AssetListItem,
  BackupManifest,
  BackupPreview,
  BackupResult,
  BatchResult,
  BulkRelinkPreview,
  ImportMode,
  ImportSourceRecord,
  ImportSourceScanResult,
  MetadataExportOptions,
  MetadataExportResult,
  MissingFileRecord,
  RelinkCandidate,
  RelinkResult,
  RestorePreview,
  SidecarExportResult,
} from "../../shared/library-types";
import { APP_NAME } from "../../shared/app-metadata";
import { createBatchResult, recordFailure, recordSkipped, recordSuccess } from "./batch-result";
import type { AssetService } from "./asset-service";
import { getExtension } from "./asset-service";
import type { ImportService } from "./import-service";
import { SUPPORTED_IMPORT_EXTENSIONS } from "./import-service";
import type { LibraryService } from "./library-service";

interface AssetPathRow {
  id: string;
  original_path: string;
  stored_path: string | null;
  file_name: string;
  file_ext: string;
  file_size: number;
  content_hash: string;
  import_mode: ImportMode;
}

interface ImportSourceRow {
  id: string;
  library_id: string;
  path: string;
  import_mode: ImportMode;
  last_scanned_at: string | null;
  created_at: string;
  updated_at: string;
}

const DEFAULT_EXPORT_OPTIONS: MetadataExportOptions = {
  format: "json",
  includePaths: false,
  includeTrashed: false,
  includeAnalysis: true,
  includePlayback: true,
};

export class LibraryManagementService {
  constructor(
    private readonly libraryService: LibraryService,
    private readonly assetService: AssetService,
    private readonly importService: ImportService,
  ) {}

  async listMissingFiles(): Promise<MissingFileRecord[]> {
    const context = this.libraryService.requireActive();
    const rows = context.db.all<AssetPathRow>(
      `
      SELECT id, original_path, stored_path, file_name, file_ext, file_size, content_hash, import_mode
      FROM assets
      WHERE library_id = ? AND trashed_at IS NULL
      ORDER BY file_name COLLATE NOCASE
      `,
      [context.library.id],
    );
    const checkedAt = new Date().toISOString();
    const missing: MissingFileRecord[] = [];

    for (const row of rows) {
      const expectedPath = row.import_mode === "copy" ? row.stored_path : row.original_path;
      const isMissing = !(await pathExists(expectedPath));
      context.db.run(
        `
        UPDATE assets
        SET file_missing = ?, file_missing_checked_at = ?
        WHERE id = ? AND library_id = ?
        `,
        [isMissing ? 1 : 0, checkedAt, row.id, context.library.id],
      );

      if (isMissing) {
        missing.push({
          assetId: row.id,
          fileName: row.file_name,
          expectedPath: expectedPath ?? row.original_path,
          importMode: row.import_mode,
          fileSize: row.file_size,
          contentHash: row.content_hash,
          checkedAt,
        });
      }
    }

    return missing;
  }

  async relinkAsset(assetId: string, newPath: string, copyIntoLibrary?: boolean): Promise<RelinkResult> {
    const context = this.libraryService.requireActive();
    const asset = await this.assetService.getAsset(assetId);
    if (!asset) {
      throw new Error("Asset not found.");
    }

    const resolvedPath = resolve(newPath);
    const fileStat = await stat(resolvedPath);
    if (!fileStat.isFile()) {
      throw new Error("Relink target is not a file.");
    }

    const nextHash = await hashFile(resolvedPath);
    const nextExt = getExtension(resolvedPath);
    const shouldCopy = copyIntoLibrary ?? asset.importMode === "copy";
    let storedPath: string | null = asset.importMode === "copy" ? asset.storedPath : null;
    let copiedIntoLibrary = false;

    if (shouldCopy) {
      await mkdir(context.library.assetsPath, { recursive: true });
      storedPath = join(context.library.assetsPath, `${nextHash.slice(0, 20)}.${nextExt}`);
      await copyFile(resolvedPath, storedPath);
      copiedIntoLibrary = true;
    } else if (asset.importMode === "link") {
      storedPath = null;
    }

    const now = new Date().toISOString();
    const previousPath = asset.importMode === "copy" && asset.storedPath ? asset.storedPath : asset.originalPath;
    context.db.run(
      `
      UPDATE assets
      SET original_path = ?, stored_path = ?, file_name = ?, file_ext = ?, file_size = ?,
        content_hash = ?, media_type = ?, file_missing = 0, file_missing_checked_at = ?,
        relinked_at = ?, updated_at = ?
      WHERE id = ? AND library_id = ?
      `,
      [
        resolvedPath,
        storedPath,
        basename(resolvedPath),
        nextExt,
        fileStat.size,
        nextHash,
        getMediaType(nextExt),
        now,
        now,
        now,
        assetId,
        context.library.id,
      ],
    );

    return {
      assetId,
      updatedAsset: await this.assetService.getAsset(assetId),
      previousPath,
      nextPath: storedPath ?? resolvedPath,
      copiedIntoLibrary,
    };
  }

  async bulkRelinkPreview(baseFolder: string): Promise<BulkRelinkPreview> {
    const missing = await this.listMissingFiles();
    const scanned = await scanFiles(baseFolder);
    const candidates: RelinkCandidate[] = [];
    const unmatched: MissingFileRecord[] = [];

    for (const item of missing) {
      const sameName = scanned.filter((candidate) => basename(candidate).toLowerCase() === item.fileName.toLowerCase());
      let best: RelinkCandidate | null = null;

      for (const candidatePath of sameName) {
        const candidateStat = await stat(candidatePath);
        const sizeMatches = candidateStat.size === item.fileSize;
        const hashMatches = sizeMatches ? (await hashFile(candidatePath)) === item.contentHash : false;
        const confidence = hashMatches ? "high" : sizeMatches ? "medium" : "low";
        const candidate: RelinkCandidate = {
          assetId: item.assetId,
          fileName: item.fileName,
          currentPath: item.expectedPath,
          candidatePath,
          confidence,
          reason: hashMatches ? "hash+name" : sizeMatches ? "name+size" : "name",
          hashMatches,
          sizeMatches,
        };
        if (!best || confidenceRank(candidate.confidence) > confidenceRank(best.confidence)) {
          best = candidate;
        }
      }

      if (best) {
        candidates.push(best);
      } else {
        unmatched.push(item);
      }
    }

    return { baseFolder, candidates, unmatched };
  }

  async bulkRelinkApply(candidates: RelinkCandidate[], copyIntoLibrary?: boolean): Promise<BatchResult> {
    const result = createBatchResult(candidates.length);
    for (const candidate of candidates) {
      try {
        await this.relinkAsset(candidate.assetId, candidate.candidatePath, copyIntoLibrary);
        recordSuccess(result);
      } catch (error) {
        recordFailure(result, candidate.assetId, error instanceof Error ? error.message : String(error));
      }
    }
    return result;
  }

  async backupPreview(destinationPath: string): Promise<BackupPreview> {
    const context = this.libraryService.requireActive();
    const counts = this.getLibraryCounts();
    const finalPath = createBackupFolderPath(destinationPath, context.library.name);
    const linkCount = context.db.get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM assets WHERE library_id = ? AND import_mode = 'link'",
      [context.library.id],
    )?.count ?? 0;

    return {
      destinationPath,
      finalPath,
      ...counts,
      includesCopiedAssets: true,
      includesCache: true,
      linkModeWarning:
        linkCount > 0
          ? "Linked original files are referenced by path and are not copied unless they already live inside the library folder."
          : null,
    };
  }

  async backupStart(destinationPath: string): Promise<BackupResult> {
    const context = this.libraryService.requireActive();
    const preview = await this.backupPreview(destinationPath);
    if (isInsideDirectory(context.library.rootPath, preview.finalPath)) {
      throw new Error("Backup destination cannot be inside the source library.");
    }

    await mkdir(preview.finalPath, { recursive: true });
    const copiedFiles = await copyDirectory(context.library.rootPath, preview.finalPath);
    const manifest: BackupManifest = {
      app: APP_NAME,
      backupVersion: 1,
      libraryName: context.library.name,
      libraryId: context.library.id,
      createdAt: new Date().toISOString(),
      assetCount: preview.assetCount,
      tagCount: preview.tagCount,
      collectionCount: preview.collectionCount,
      includesCopiedAssets: preview.includesCopiedAssets,
      includesCache: preview.includesCache,
      sourceRootPath: context.library.rootPath,
    };
    const manifestPath = join(preview.finalPath, "backup-manifest.json");
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    return {
      destinationPath: preview.finalPath,
      manifestPath,
      manifest,
      copiedFiles,
      warnings: preview.linkModeWarning ? [preview.linkModeWarning] : [],
    };
  }

  async restorePreview(sourcePath: string): Promise<RestorePreview> {
    const manifestPath = join(sourcePath, "backup-manifest.json");
    const databasePath = join(sourcePath, ".suwol-audio", "library.sqlite");
    const manifest = (await pathExists(manifestPath))
      ? (JSON.parse(await readTextFile(manifestPath)) as BackupManifest)
      : null;
    const hasDatabase = await pathExists(databasePath);
    return {
      sourcePath,
      manifest,
      hasDatabase,
      canRestore: hasDatabase,
      warnings: hasDatabase ? [] : ["Backup does not contain .suwol-audio/library.sqlite."],
    };
  }

  async exportMetadata(options: Partial<MetadataExportOptions>, outputPath: string): Promise<MetadataExportResult> {
    const context = this.libraryService.requireActive();
    const resolvedOptions = { ...DEFAULT_EXPORT_OPTIONS, ...options };
    const assets = await this.listAllAssets(resolvedOptions.includeTrashed);
    const tags = context.db.all("SELECT * FROM tags WHERE library_id = ? ORDER BY name COLLATE NOCASE", [
      context.library.id,
    ]);
    const collections = context.db.all(
      "SELECT * FROM collections WHERE library_id = ? ORDER BY name COLLATE NOCASE",
      [context.library.id],
    );
    await mkdir(outputPath, { recursive: true });

    if (resolvedOptions.format === "json") {
      const outputFile = join(outputPath, "suwol-audio-library-export.json");
      await writeFile(
        outputFile,
        `${JSON.stringify(
          {
            app: APP_NAME,
            exportVersion: 1,
            createdAt: new Date().toISOString(),
            options: resolvedOptions,
            assets: assets.map((asset) => serializeAsset(asset, resolvedOptions)),
            tags,
            collections,
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      return { outputPath: outputFile, format: "json", fileCount: 1, assetCount: assets.length, warnings: [] };
    }

    const files = [
      ["assets.csv", toCsv(assets.map((asset) => serializeAsset(asset, resolvedOptions)))],
      ["tags.csv", toCsv(tags as Record<string, unknown>[])],
      ["collections.csv", toCsv(collections as Record<string, unknown>[])],
      [
        "asset_tags.csv",
        toCsv(
          context.db.all<Record<string, unknown>>(
            `
            SELECT at.asset_id, at.tag_id, at.created_at
            FROM asset_tags at
            JOIN assets a ON a.id = at.asset_id
            WHERE a.library_id = ?
            `,
            [context.library.id],
          ),
        ),
      ],
      [
        "collection_assets.csv",
        toCsv(
          context.db.all<Record<string, unknown>>(
            `
            SELECT ca.collection_id, ca.asset_id, ca.sort_order, ca.created_at
            FROM collection_assets ca
            JOIN collections c ON c.id = ca.collection_id
            WHERE c.library_id = ?
            `,
            [context.library.id],
          ),
        ),
      ],
    ];
    for (const [fileName, content] of files) {
      await writeFile(join(outputPath, fileName), content, "utf8");
    }
    return { outputPath, format: "csv", fileCount: files.length, assetCount: assets.length, warnings: [] };
  }

  async exportSidecars(assetIds: string[], overwrite = false): Promise<SidecarExportResult> {
    const result: SidecarExportResult = { requested: assetIds.length, success: 0, failed: 0, files: [], failures: [] };
    for (const assetId of assetIds) {
      try {
        const asset = await this.assetService.getAsset(assetId);
        if (!asset) {
          throw new Error("Asset not found.");
        }
        const sourcePath = this.assetService.getAssetFilePath(asset);
        const sidecarPath = join(dirname(sourcePath), `${basename(sourcePath, extname(sourcePath))}.suwol-audio.json`);
        if (!overwrite && (await pathExists(sidecarPath))) {
          throw new Error("Sidecar already exists.");
        }
        await writeFile(
          sidecarPath,
          `${JSON.stringify(
            {
              fileName: asset.fileName,
              tags: asset.tags.map((tag) => tag.name),
              collections: asset.collections.map((collection) => collection.name),
              rating: asset.rating,
              favorite: asset.favorite,
              memo: asset.memo,
              analysis: asset.audioAnalysis
                ? {
                    durationMs: asset.audioAnalysis.durationMs,
                    classification: asset.audioAnalysis.classification,
                    loopScore: asset.audioAnalysis.loopScore,
                  }
                : null,
            },
            null,
            2,
          )}\n`,
          "utf8",
        );
        result.success += 1;
        result.files.push(sidecarPath);
      } catch (error) {
        result.failed += 1;
        result.failures.push({ assetId, reason: error instanceof Error ? error.message : String(error) });
      }
    }
    return result;
  }

  async listImportSources(): Promise<ImportSourceRecord[]> {
    const context = this.libraryService.requireActive();
    return context.db
      .all<ImportSourceRow>("SELECT * FROM import_sources WHERE library_id = ? ORDER BY updated_at DESC", [
        context.library.id,
      ])
      .map(mapImportSourceRow);
  }

  async addImportSource(path: string, importMode: ImportMode = "copy"): Promise<ImportSourceRecord> {
    const context = this.libraryService.requireActive();
    const resolvedPath = resolve(path);
    const now = new Date().toISOString();
    const existing = context.db.get<ImportSourceRow>(
      "SELECT * FROM import_sources WHERE library_id = ? AND path = ?",
      [context.library.id, resolvedPath],
    );
    if (existing) {
      return mapImportSourceRow(existing);
    }
    const id = randomUUID();
    context.db.run(
      `
      INSERT INTO import_sources (id, library_id, path, import_mode, last_scanned_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, NULL, ?, ?)
      `,
      [id, context.library.id, resolvedPath, importMode, now, now],
    );
    return mapImportSourceRow(context.db.get<ImportSourceRow>("SELECT * FROM import_sources WHERE id = ?", [id])!);
  }

  async scanImportSource(sourceId: string): Promise<ImportSourceScanResult> {
    const context = this.libraryService.requireActive();
    const source = this.getImportSource(sourceId);
    const files = await scanFiles(source.path);
    const scannedAt = new Date().toISOString();
    const knownHashes = new Set(
      context.db
        .all<{ content_hash: string }>("SELECT content_hash FROM assets WHERE library_id = ?", [context.library.id])
        .map((row) => row.content_hash),
    );
    const newFiles: string[] = [];
    const duplicateFiles: string[] = [];
    const unsupportedFiles: string[] = [];

    for (const filePath of files) {
      const ext = getExtension(filePath);
      if (!SUPPORTED_IMPORT_EXTENSIONS.has(ext)) {
        unsupportedFiles.push(filePath);
        continue;
      }
      const contentHash = await hashFile(filePath);
      if (knownHashes.has(contentHash)) {
        duplicateFiles.push(filePath);
      } else {
        newFiles.push(filePath);
      }
    }

    const missingLinkedFiles = context.db
      .all<{ original_path: string }>(
        "SELECT original_path FROM assets WHERE library_id = ? AND import_mode = 'link' AND original_path LIKE ?",
        [context.library.id, `${source.path}%`],
      )
      .map((row) => row.original_path)
      .filter((path) => !files.includes(path));

    context.db.run("UPDATE import_sources SET last_scanned_at = ?, updated_at = ? WHERE id = ?", [
      scannedAt,
      scannedAt,
      sourceId,
    ]);

    return { source: { ...source, lastScannedAt: scannedAt, updatedAt: scannedAt }, scannedAt, newFiles, duplicateFiles, unsupportedFiles, missingLinkedFiles };
  }

  async importNewFromSource(sourceId: string) {
    const scan = await this.scanImportSource(sourceId);
    return this.importService.importFiles(scan.newFiles, scan.source.importMode);
  }

  private getImportSource(sourceId: string): ImportSourceRecord {
    const context = this.libraryService.requireActive();
    const row = context.db.get<ImportSourceRow>("SELECT * FROM import_sources WHERE id = ? AND library_id = ?", [
      sourceId,
      context.library.id,
    ]);
    if (!row) {
      throw new Error("Import source not found.");
    }
    return mapImportSourceRow(row);
  }

  private getLibraryCounts(): { assetCount: number; tagCount: number; collectionCount: number } {
    const context = this.libraryService.requireActive();
    return {
      assetCount:
        context.db.get<{ count: number }>("SELECT COUNT(*) AS count FROM assets WHERE library_id = ?", [
          context.library.id,
        ])?.count ?? 0,
      tagCount:
        context.db.get<{ count: number }>("SELECT COUNT(*) AS count FROM tags WHERE library_id = ?", [
          context.library.id,
        ])?.count ?? 0,
      collectionCount:
        context.db.get<{ count: number }>("SELECT COUNT(*) AS count FROM collections WHERE library_id = ?", [
          context.library.id,
        ])?.count ?? 0,
    };
  }

  private async listAllAssets(includeTrashed: boolean): Promise<AssetListItem[]> {
    const assets: AssetListItem[] = [];
    let page = 1;
    while (true) {
      const result = await this.assetService.listAssetPage({ includeTrashed, page, pageSize: 1000 });
      assets.push(...result.items);
      if (assets.length >= result.total || result.items.length === 0) {
        return assets;
      }
      page += 1;
    }
  }
}

function mapImportSourceRow(row: ImportSourceRow): ImportSourceRecord {
  return {
    id: row.id,
    libraryId: row.library_id,
    path: row.path,
    importMode: row.import_mode,
    lastScannedAt: row.last_scanned_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getMediaType(ext: string): "audio" | "midi" | "data" | "archive" {
  if (ext === "mid" || ext === "midi") {
    return "midi";
  }
  if (ext === "json") {
    return "data";
  }
  if (ext === "zip") {
    return "archive";
  }
  return "audio";
}

function confidenceRank(value: RelinkCandidate["confidence"]): number {
  if (value === "high") {
    return 3;
  }
  if (value === "medium") {
    return 2;
  }
  return 1;
}

async function scanFiles(rootPath: string): Promise<string[]> {
  const entries = await readdir(rootPath, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await scanFiles(path)));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

async function hashFile(filePath: string): Promise<string> {
  return new Promise((resolveHash, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });
}

async function pathExists(path: string | null | undefined): Promise<boolean> {
  if (!path) {
    return false;
  }
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readTextFile(path: string): Promise<string> {
  return readFile(path, "utf8");
}

function createBackupFolderPath(destinationPath: string, libraryName: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeName = libraryName.replace(/[<>:"/\\|?*]+/g, "_").slice(0, 80) || "Suwol Audio Library";
  return join(resolve(destinationPath), `${safeName}-backup-${stamp}`);
}

async function copyDirectory(source: string, destination: string): Promise<number> {
  await mkdir(destination, { recursive: true });
  let count = 0;
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = join(source, entry.name);
    const destinationPath = join(destination, entry.name);
    if (entry.isDirectory()) {
      count += await copyDirectory(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      await copyFile(sourcePath, destinationPath);
      count += 1;
    }
  }
  return count;
}

function serializeAsset(asset: AssetListItem, options: MetadataExportOptions): Record<string, unknown> {
  return {
    id: asset.id,
    fileName: asset.fileName,
    fileExt: asset.fileExt,
    fileSize: asset.fileSize,
    importMode: asset.importMode,
    mediaType: asset.mediaType,
    title: asset.title,
    memo: asset.memo,
    rating: asset.rating,
    favorite: asset.favorite,
    trashedAt: asset.trashedAt,
    originalPath: options.includePaths ? asset.originalPath : undefined,
    storedPath: options.includePaths ? asset.storedPath : undefined,
    tags: asset.tags.map((tag) => tag.name),
    collections: asset.collections.map((collection) => collection.name),
    analysis: options.includeAnalysis ? asset.audioAnalysis : undefined,
    playCount: options.includePlayback ? asset.playCount : undefined,
    lastPlayedAt: options.includePlayback ? asset.lastPlayedAt : undefined,
  };
}

function toCsv(rows: Record<string, unknown>[]): string {
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const lines = [keys.join(",")];
  for (const row of rows) {
    lines.push(keys.map((key) => csvCell(row[key])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function csvCell(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function isInsideDirectory(directory: string, target: string): boolean {
  const rel = relative(directory, target);
  return Boolean(rel) && !rel.startsWith("..") && !isAbsolute(rel);
}
