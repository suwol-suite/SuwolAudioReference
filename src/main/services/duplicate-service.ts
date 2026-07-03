import { randomUUID } from "node:crypto";
import type { BatchResult, DuplicateGroupSummary, DuplicateMergeInput } from "../../shared/library-types";
import { createBatchResult, recordFailure, recordSkipped, recordSuccess } from "./batch-result";
import type { AssetService } from "./asset-service";
import type { LibraryService } from "./library-service";
import type { TrashService } from "./trash-service";

interface DuplicateHashRow {
  content_hash: string;
  file_size: number;
  count: number;
  ignored_at: string | null;
}

export class DuplicateService {
  constructor(
    private readonly libraryService: LibraryService,
    private readonly assetService: AssetService,
    private readonly trashService: TrashService,
  ) {}

  async listGroups(): Promise<DuplicateGroupSummary[]> {
    const context = this.libraryService.requireActive();
    const groups = context.db.all<DuplicateHashRow>(
      `
      SELECT a.content_hash, a.file_size, COUNT(*) AS count, ig.ignored_at
      FROM assets a
      LEFT JOIN ignored_duplicate_groups ig
        ON ig.library_id = a.library_id AND ig.content_hash = a.content_hash
      WHERE a.library_id = ? AND a.trashed_at IS NULL
      GROUP BY a.content_hash, a.file_size
      HAVING COUNT(*) > 1
      ORDER BY count DESC, a.file_size DESC
      `,
      [context.library.id],
    );

    const result: DuplicateGroupSummary[] = [];
    for (const group of groups) {
      const assetRows = context.db.all<{ id: string }>(
        "SELECT id FROM assets WHERE library_id = ? AND content_hash = ? AND trashed_at IS NULL ORDER BY created_at ASC",
        [context.library.id, group.content_hash],
      );
      const assets = [];
      for (const row of assetRows) {
        const asset = await this.assetService.getAsset(row.id);
        if (asset) {
          assets.push({
            asset,
            tagNames: asset.tags.map((tag) => tag.name),
            collectionNames: asset.collections.map((collection) => collection.name),
          });
        }
      }
      result.push({
        contentHash: group.content_hash,
        fileSize: group.file_size,
        count: group.count,
        ignored: Boolean(group.ignored_at),
        assets,
      });
    }
    return result;
  }

  async mergeMetadata(input: DuplicateMergeInput): Promise<BatchResult> {
    const context = this.libraryService.requireActive();
    const result = createBatchResult(input.mergeAssetIds.length);
    const keep = await this.assetService.getAsset(input.keepAssetId);
    if (!keep || keep.contentHash !== input.contentHash) {
      input.mergeAssetIds.forEach((assetId) => recordFailure(result, assetId, "Keep asset is not in the duplicate group."));
      return result;
    }

    let nextFavorite = keep.favorite;
    let nextRating = keep.rating;
    for (const assetId of input.mergeAssetIds) {
      const duplicate = await this.assetService.getAsset(assetId);
      if (!duplicate || duplicate.contentHash !== input.contentHash || duplicate.id === keep.id) {
        recordFailure(result, assetId, "Duplicate asset is not in the duplicate group.");
        continue;
      }

      if (input.mergeTags !== false) {
        for (const tag of duplicate.tags) {
          context.db.run("INSERT OR IGNORE INTO asset_tags (asset_id, tag_id, created_at) VALUES (?, ?, ?)", [
            keep.id,
            tag.id,
            new Date().toISOString(),
          ]);
        }
      }

      if (input.mergeCollections !== false) {
        for (const collection of duplicate.collections) {
          context.db.run(
            "INSERT OR IGNORE INTO collection_assets (collection_id, asset_id, sort_order, created_at) VALUES (?, ?, 0, ?)",
            [collection.id, keep.id, new Date().toISOString()],
          );
        }
      }

      if (input.mergeFavorite !== false) {
        nextFavorite = nextFavorite || duplicate.favorite;
      }
      if (input.mergeRating === "highest") {
        nextRating = Math.max(nextRating, duplicate.rating);
      }
      recordSuccess(result);
    }

    await this.assetService.updateAsset(keep.id, { favorite: nextFavorite, rating: nextRating });
    return result;
  }

  async trashDuplicates(input: { keepAssetId: string; duplicateAssetIds: string[] }): Promise<BatchResult> {
    const keep = await this.assetService.getAsset(input.keepAssetId);
    if (!keep) {
      const result = createBatchResult(input.duplicateAssetIds.length);
      input.duplicateAssetIds.forEach((assetId) => recordFailure(result, assetId, "Keep asset not found."));
      return result;
    }
    const filtered = [];
    for (const assetId of input.duplicateAssetIds) {
      const asset = await this.assetService.getAsset(assetId);
      if (asset?.contentHash === keep.contentHash && asset.id !== keep.id) {
        filtered.push(assetId);
      }
    }
    return this.trashService.trash(filtered);
  }

  async ignoreGroup(contentHash: string): Promise<BatchResult> {
    const context = this.libraryService.requireActive();
    const result = createBatchResult(1);
    const groupExists = context.db.get<{ count: number }>(
      `
      SELECT COUNT(*) AS count
      FROM assets
      WHERE library_id = ? AND content_hash = ? AND trashed_at IS NULL
      GROUP BY content_hash
      HAVING COUNT(*) > 1
      `,
      [context.library.id, contentHash],
    );
    if (!groupExists) {
      recordSkipped(result, "Duplicate group not found.");
      return result;
    }

    context.db.run(
      `
      INSERT INTO ignored_duplicate_groups (id, library_id, content_hash, ignored_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(library_id, content_hash) DO UPDATE SET ignored_at = excluded.ignored_at
      `,
      [randomUUID(), context.library.id, contentHash, new Date().toISOString()],
    );
    recordSuccess(result);
    return result;
  }
}
