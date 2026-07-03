import { randomUUID } from "node:crypto";
import type { BatchResult, CollectionRecord, CollectionUsageRecord } from "../../shared/library-types";
import type { LibraryService } from "./library-service";
import { mapCollectionRow } from "./library-service";
import { createBatchResult, recordFailure, recordSuccess } from "./batch-result";

interface CollectionRow {
  id: string;
  library_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export class CollectionService {
  constructor(private readonly libraryService: LibraryService) {}

  async listCollections(): Promise<CollectionRecord[]> {
    const context = this.libraryService.requireActive();
    return context.db.all<CollectionRow>(
      "SELECT * FROM collections WHERE library_id = ? ORDER BY name COLLATE NOCASE",
      [context.library.id],
    ).map(mapCollectionRow);
  }

  async listCollectionsWithUsage(): Promise<CollectionUsageRecord[]> {
    const context = this.libraryService.requireActive();
    return context.db.all<CollectionRow & { asset_count: number }>(
      `
      SELECT c.*, COUNT(ca.asset_id) AS asset_count
      FROM collections c
      LEFT JOIN collection_assets ca ON ca.collection_id = c.id
      WHERE c.library_id = ?
      GROUP BY c.id
      ORDER BY c.name COLLATE NOCASE
      `,
      [context.library.id],
    ).map((row) => ({ ...mapCollectionRow(row), assetCount: row.asset_count }));
  }

  async createCollection(input: { name: string; description?: string }): Promise<CollectionRecord> {
    const context = this.libraryService.requireActive();
    const name = input.name.trim();
    if (!name) {
      throw new Error("컬렉션 이름이 비어 있습니다.");
    }

    const existing = context.db.get<CollectionRow>(
      "SELECT * FROM collections WHERE library_id = ? AND name = ? COLLATE NOCASE",
      [context.library.id, name],
    );
    if (existing) {
      return mapCollectionRow(existing);
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    context.db.run(
      `
      INSERT INTO collections (id, library_id, name, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [id, context.library.id, name, input.description?.trim() || null, now, now],
    );

    const row = context.db.get<CollectionRow>("SELECT * FROM collections WHERE id = ?", [id]);
    if (!row) {
      throw new Error("컬렉션을 만들 수 없습니다.");
    }
    return mapCollectionRow(row);
  }

  async addAssets(input: { collectionId: string; assetIds: string[] }): Promise<BatchResult> {
    return this.applyCollectionChange(input.collectionId, input.assetIds, "add");
  }

  async removeAssets(input: { collectionId: string; assetIds: string[] }): Promise<BatchResult> {
    return this.applyCollectionChange(input.collectionId, input.assetIds, "remove");
  }

  async renameCollection(input: { collectionId: string; name: string }): Promise<CollectionRecord> {
    const context = this.libraryService.requireActive();
    const name = input.name.trim();
    if (!name) {
      throw new Error("Collection name is empty.");
    }
    const duplicate = context.db.get<{ id: string }>(
      "SELECT id FROM collections WHERE library_id = ? AND name = ? COLLATE NOCASE AND id != ?",
      [context.library.id, name, input.collectionId],
    );
    if (duplicate) {
      throw new Error("Collection name already exists.");
    }
    context.db.run(
      "UPDATE collections SET name = ?, updated_at = ? WHERE id = ? AND library_id = ?",
      [name, new Date().toISOString(), input.collectionId, context.library.id],
    );
    const row = context.db.get<CollectionRow>("SELECT * FROM collections WHERE id = ? AND library_id = ?", [
      input.collectionId,
      context.library.id,
    ]);
    if (!row) {
      throw new Error("Collection not found.");
    }
    return mapCollectionRow(row);
  }

  async updateDescription(input: { collectionId: string; description: string }): Promise<CollectionRecord> {
    const context = this.libraryService.requireActive();
    context.db.run(
      "UPDATE collections SET description = ?, updated_at = ? WHERE id = ? AND library_id = ?",
      [input.description.trim() || null, new Date().toISOString(), input.collectionId, context.library.id],
    );
    const row = context.db.get<CollectionRow>("SELECT * FROM collections WHERE id = ? AND library_id = ?", [
      input.collectionId,
      context.library.id,
    ]);
    if (!row) {
      throw new Error("Collection not found.");
    }
    return mapCollectionRow(row);
  }

  async deleteCollections(collectionIds: string[]): Promise<BatchResult> {
    const context = this.libraryService.requireActive();
    const result = createBatchResult(collectionIds.length);
    for (const collectionId of collectionIds) {
      const collection = context.db.get<{ id: string }>(
        "SELECT id FROM collections WHERE id = ? AND library_id = ?",
        [collectionId, context.library.id],
      );
      if (!collection) {
        recordFailure(result, collectionId, "Collection not found.");
        continue;
      }
      context.db.run("DELETE FROM collection_assets WHERE collection_id = ?", [collectionId]);
      context.db.run("DELETE FROM collections WHERE id = ? AND library_id = ?", [
        collectionId,
        context.library.id,
      ]);
      recordSuccess(result);
    }
    return result;
  }

  async deleteEmptyCollections(): Promise<BatchResult> {
    const empty = (await this.listCollectionsWithUsage()).filter((collection) => collection.assetCount === 0);
    return this.deleteCollections(empty.map((collection) => collection.id));
  }

  private async applyCollectionChange(
    collectionId: string,
    assetIds: string[],
    action: "add" | "remove",
  ): Promise<BatchResult> {
    const context = this.libraryService.requireActive();
    const result = createBatchResult(assetIds.length);
    const collection = context.db.get<{ id: string }>(
      "SELECT id FROM collections WHERE id = ? AND library_id = ?",
      [collectionId, context.library.id],
    );
    if (!collection) {
      assetIds.forEach((assetId) => recordFailure(result, assetId, "컬렉션을 찾을 수 없습니다."));
      return result;
    }

    for (const assetId of assetIds) {
      const asset = context.db.get<{ id: string }>("SELECT id FROM assets WHERE id = ? AND library_id = ?", [
        assetId,
        context.library.id,
      ]);
      if (!asset) {
        recordFailure(result, assetId, "asset을 찾을 수 없습니다.");
        continue;
      }

      if (action === "add") {
        context.db.run(
          "INSERT OR IGNORE INTO collection_assets (collection_id, asset_id, sort_order, created_at) VALUES (?, ?, 0, ?)",
          [collectionId, assetId, new Date().toISOString()],
        );
      } else {
        context.db.run("DELETE FROM collection_assets WHERE collection_id = ? AND asset_id = ?", [
          collectionId,
          assetId,
        ]);
      }
      recordSuccess(result);
    }

    return result;
  }
}
