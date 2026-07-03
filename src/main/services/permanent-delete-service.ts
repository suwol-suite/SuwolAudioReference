import { unlink } from "node:fs/promises";
import { isAbsolute, relative } from "node:path";
import type { BatchResult } from "../../shared/library-types";
import type { AssetService } from "./asset-service";
import type { LibraryService } from "./library-service";
import { createBatchResult, recordFailure, recordSuccess } from "./batch-result";

export class PermanentDeleteService {
  constructor(
    private readonly libraryService: LibraryService,
    private readonly assetService: AssetService,
  ) {}

  async deletePermanent(assetIds: string[]): Promise<BatchResult> {
    const context = this.libraryService.requireActive();
    const result = createBatchResult(assetIds.length);

    for (const assetId of assetIds) {
      const asset = await this.assetService.getAsset(assetId);
      if (!asset) {
        recordFailure(result, assetId, "asset을 찾을 수 없습니다.");
        continue;
      }

      if (asset.importMode === "copy") {
        if (!asset.storedPath || !isInsideDirectory(context.library.assetsPath, asset.storedPath)) {
          recordFailure(result, assetId, "내부 복사 파일 경로가 안전하지 않습니다.");
          continue;
        }

        try {
          await unlink(asset.storedPath);
        } catch (error) {
          recordFailure(result, assetId, error instanceof Error ? error.message : String(error));
          continue;
        }
      }

      this.assetService.deleteAssetRecord(assetId);
      recordSuccess(result);
    }

    return result;
  }
}

function isInsideDirectory(directory: string, target: string): boolean {
  const rel = relative(directory, target);
  return Boolean(rel) && !rel.startsWith("..") && !isAbsolute(rel);
}
