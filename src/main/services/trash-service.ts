import type { BatchResult } from "../../shared/library-types";
import type { LibraryService } from "./library-service";
import { createBatchResult, recordFailure, recordSuccess } from "./batch-result";

export class TrashService {
  constructor(private readonly libraryService: LibraryService) {}

  async trash(assetIds: string[]): Promise<BatchResult> {
    return this.setTrashed(assetIds, new Date().toISOString());
  }

  async restore(assetIds: string[]): Promise<BatchResult> {
    return this.setTrashed(assetIds, null);
  }

  private async setTrashed(assetIds: string[], trashedAt: string | null): Promise<BatchResult> {
    const context = this.libraryService.requireActive();
    const result = createBatchResult(assetIds.length);

    for (const assetId of assetIds) {
      const exists = context.db.get<{ id: string }>("SELECT id FROM assets WHERE id = ? AND library_id = ?", [
        assetId,
        context.library.id,
      ]);
      if (!exists) {
        recordFailure(result, assetId, "asset을 찾을 수 없습니다.");
        continue;
      }
      context.db.run("UPDATE assets SET trashed_at = ?, updated_at = ? WHERE id = ?", [
        trashedAt,
        new Date().toISOString(),
        assetId,
      ]);
      recordSuccess(result);
    }

    return result;
  }
}
