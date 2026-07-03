import { createReadStream } from "node:fs";
import { copyFile, mkdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { ImportFilesResult, ImportMode, MediaType } from "../../shared/library-types";
import type { AnalysisAppService } from "./analysis-app-service";
import type { LibraryService } from "./library-service";
import type { LoggerService } from "./logger-service";
import { createBatchResult, recordFailure, recordSkipped, recordSuccess } from "./batch-result";
import { getExtension } from "./asset-service";

export const SUPPORTED_IMPORT_EXTENSIONS = new Set([
  "wav",
  "mp3",
  "ogg",
  "flac",
  "m4a",
  "aac",
  "opus",
  "mid",
  "midi",
  "json",
  "zip",
]);

export class ImportService {
  constructor(
    private readonly libraryService: LibraryService,
    private readonly analysisService: AnalysisAppService,
    private readonly loggerService?: LoggerService,
  ) {}

  async importFiles(filePaths: string[], importMode: ImportMode = "copy"): Promise<ImportFilesResult> {
    const context = this.libraryService.requireActive();
    await this.loggerService?.info(`import start requested=${filePaths.length}`);
    const result: ImportFilesResult = {
      ...createBatchResult(filePaths.length),
      importedAssetIds: [],
      summary: {
        requested: filePaths.length,
        success: 0,
        duplicateSkipped: 0,
        unsupportedSkipped: 0,
        analysisFailed: 0,
        copyFailed: 0,
        otherFailed: 0,
      },
    };

    await mkdir(context.library.assetsPath, { recursive: true });

    for (const filePath of filePaths) {
      let copyFailedForFile = false;
      const ext = getExtension(filePath);
      if (!SUPPORTED_IMPORT_EXTENSIONS.has(ext)) {
        recordSkipped(result, `지원하지 않는 확장자: ${basename(filePath)}`);
        result.summary.unsupportedSkipped += 1;
        continue;
      }

      try {
        const fileStat = await stat(filePath);
        if (!fileStat.isFile()) {
          recordSkipped(result, `파일이 아닙니다: ${filePath}`);
          continue;
        }

        const contentHash = await hashFile(filePath);
        const duplicate = context.db.get<{ id: string }>(
          "SELECT id FROM assets WHERE library_id = ? AND content_hash = ?",
          [context.library.id, contentHash],
        );
        if (duplicate) {
          recordSkipped(result, `이미 가져온 파일입니다: ${basename(filePath)}`);
          result.summary.duplicateSkipped += 1;
          continue;
        }

        const assetId = randomUUID();
        const now = new Date().toISOString();
        const storedPath =
          importMode === "copy" ? join(context.library.assetsPath, `${contentHash.slice(0, 20)}.${ext}`) : null;

        if (storedPath) {
          try {
            await copyFile(filePath, storedPath);
          } catch (error) {
            copyFailedForFile = true;
            result.summary.copyFailed += 1;
            throw error;
          }
        }

        context.db.run(
          `
          INSERT INTO assets (
            id, library_id, original_path, stored_path, file_name, file_ext, file_size,
            content_hash, import_mode, media_type, title, memo, rating, favorite,
            trashed_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 0, 0, NULL, ?, ?)
          `,
          [
            assetId,
            context.library.id,
            filePath,
            storedPath,
            basename(filePath),
            ext,
            fileStat.size,
            contentHash,
            importMode,
            getMediaType(ext),
            basename(filePath, `.${ext}`),
            now,
            now,
          ],
        );

        result.importedAssetIds.push(assetId);
        recordSuccess(result);
        result.summary.success += 1;

        try {
          await this.analysisService.rerun(assetId);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          result.summary.analysisFailed += 1;
          result.warnings.push(`분석 실패(${basename(filePath)}): ${message}`);
          await this.loggerService?.warn(`analysis failed asset=${assetId} file=${basename(filePath)} message=${message}`);
          context.db.run(
            "INSERT INTO import_warnings (id, asset_id, message, created_at) VALUES (?, ?, ?, ?)",
            [randomUUID(), assetId, message, new Date().toISOString()],
          );
        }
      } catch (error) {
        if (!copyFailedForFile) {
          result.summary.otherFailed += 1;
        }
        await this.loggerService?.error(`import failed file=${basename(filePath)} message=${error instanceof Error ? error.message : String(error)}`);
        recordFailure(result, filePath, error instanceof Error ? error.message : String(error));
      }
    }

    await this.loggerService?.info(`import complete requested=${result.summary.requested} success=${result.summary.success} duplicate=${result.summary.duplicateSkipped} unsupported=${result.summary.unsupportedSkipped} analysisFailed=${result.summary.analysisFailed} failed=${result.failed}`);
    return result;
  }
}

function getMediaType(ext: string): MediaType {
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

function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}
