import { randomUUID } from "node:crypto";
import type { BatchResult, TagRecord, TagUsageRecord } from "../../shared/library-types";
import type { AssetTagRepository } from "./audio-recommendation-service";
import type { LibraryService } from "./library-service";
import { mapTagRow } from "./library-service";
import { createBatchResult, recordFailure, recordSkipped, recordSuccess } from "./batch-result";

interface TagRow {
  id: string;
  library_id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
}

const TAG_COLORS = ["#55c7a5", "#f4b860", "#7aa7ff", "#df7f99", "#b68cff", "#6fc5e8"];

export class TagService {
  constructor(private readonly libraryService: LibraryService) {}

  async listTags(): Promise<TagRecord[]> {
    const context = this.libraryService.requireActive();
    return context.db.all<TagRow>("SELECT * FROM tags WHERE library_id = ? ORDER BY name COLLATE NOCASE", [
      context.library.id,
    ]).map(mapTagRow);
  }

  async listTagsWithUsage(): Promise<TagUsageRecord[]> {
    const context = this.libraryService.requireActive();
    return context.db.all<TagRow & { asset_count: number }>(
      `
      SELECT t.*, COUNT(at.asset_id) AS asset_count
      FROM tags t
      LEFT JOIN asset_tags at ON at.tag_id = t.id
      WHERE t.library_id = ?
      GROUP BY t.id
      ORDER BY t.name COLLATE NOCASE
      `,
      [context.library.id],
    ).map((row) => ({ ...mapTagRow(row), assetCount: row.asset_count }));
  }

  async createTag(input: { name: string; color?: string }): Promise<TagRecord> {
    const context = this.libraryService.requireActive();
    const name = normalizeTagName(input.name);
    if (!name) {
      throw new Error("태그 이름이 비어 있습니다.");
    }

    const existing = this.findTagByNameSync(name);
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const color = input.color ?? TAG_COLORS[Math.abs(hashString(name)) % TAG_COLORS.length];
    const id = randomUUID();
    context.db.run(
      `
      INSERT INTO tags (id, library_id, name, color, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [id, context.library.id, name, color, now, now],
    );

    const row = context.db.get<TagRow>("SELECT * FROM tags WHERE id = ?", [id]);
    if (!row) {
      throw new Error("태그를 만들 수 없습니다.");
    }
    return mapTagRow(row);
  }

  async applyToAssets(input: { assetIds: string[]; tagNames: string[] }): Promise<BatchResult> {
    const context = this.libraryService.requireActive();
    const tagNames = Array.from(new Set(input.tagNames.map(normalizeTagName).filter(Boolean)));
    const result = createBatchResult(input.assetIds.length);

    if (tagNames.length === 0) {
      input.assetIds.forEach(() => recordSkipped(result, "적용할 태그가 없습니다."));
      return result;
    }

    const tags = [];
    for (const tagName of tagNames) {
      tags.push(await this.createTag({ name: tagName }));
    }

    for (const assetId of input.assetIds) {
      const exists = context.db.get<{ id: string }>("SELECT id FROM assets WHERE id = ? AND library_id = ?", [
        assetId,
        context.library.id,
      ]);
      if (!exists) {
        recordFailure(result, assetId, "asset을 찾을 수 없습니다.");
        continue;
      }

      for (const tag of tags) {
        context.db.run("INSERT OR IGNORE INTO asset_tags (asset_id, tag_id, created_at) VALUES (?, ?, ?)", [
          assetId,
          tag.id,
          new Date().toISOString(),
        ]);
      }
      recordSuccess(result);
    }

    return result;
  }

  async removeFromAssets(input: { assetIds: string[]; tagIds: string[] }): Promise<BatchResult> {
    const context = this.libraryService.requireActive();
    const result = createBatchResult(input.assetIds.length);

    for (const assetId of input.assetIds) {
      const exists = context.db.get<{ id: string }>("SELECT id FROM assets WHERE id = ? AND library_id = ?", [
        assetId,
        context.library.id,
      ]);
      if (!exists) {
        recordFailure(result, assetId, "asset을 찾을 수 없습니다.");
        continue;
      }

      for (const tagId of input.tagIds) {
        context.db.run("DELETE FROM asset_tags WHERE asset_id = ? AND tag_id = ?", [assetId, tagId]);
      }
      recordSuccess(result);
    }

    return result;
  }

  async renameTag(input: { tagId: string; name: string; color?: string }): Promise<TagRecord> {
    const context = this.libraryService.requireActive();
    const name = normalizeTagName(input.name);
    if (!name) {
      throw new Error("Tag name is empty.");
    }
    const duplicate = context.db.get<{ id: string }>(
      "SELECT id FROM tags WHERE library_id = ? AND name = ? COLLATE NOCASE AND id != ?",
      [context.library.id, name, input.tagId],
    );
    if (duplicate) {
      throw new Error("Tag name already exists.");
    }
    context.db.run(
      `
      UPDATE tags
      SET name = ?, color = COALESCE(?, color), updated_at = ?
      WHERE id = ? AND library_id = ?
      `,
      [name, input.color ?? null, new Date().toISOString(), input.tagId, context.library.id],
    );
    const row = context.db.get<TagRow>("SELECT * FROM tags WHERE id = ? AND library_id = ?", [
      input.tagId,
      context.library.id,
    ]);
    if (!row) {
      throw new Error("Tag not found.");
    }
    return mapTagRow(row);
  }

  async mergeTags(input: { sourceTagIds: string[]; targetTagId: string }): Promise<BatchResult> {
    const context = this.libraryService.requireActive();
    const sourceIds = Array.from(new Set(input.sourceTagIds.filter((tagId) => tagId !== input.targetTagId)));
    const result = createBatchResult(sourceIds.length);
    const target = context.db.get<{ id: string }>("SELECT id FROM tags WHERE id = ? AND library_id = ?", [
      input.targetTagId,
      context.library.id,
    ]);
    if (!target) {
      sourceIds.forEach((tagId) => recordFailure(result, tagId, "Target tag not found."));
      return result;
    }

    for (const sourceTagId of sourceIds) {
      const source = context.db.get<{ id: string }>("SELECT id FROM tags WHERE id = ? AND library_id = ?", [
        sourceTagId,
        context.library.id,
      ]);
      if (!source) {
        recordFailure(result, sourceTagId, "Source tag not found.");
        continue;
      }
      context.db.run(
        `
        INSERT OR IGNORE INTO asset_tags (asset_id, tag_id, created_at)
        SELECT asset_id, ?, created_at
        FROM asset_tags
        WHERE tag_id = ?
        `,
        [input.targetTagId, sourceTagId],
      );
      context.db.run("DELETE FROM asset_tags WHERE tag_id = ?", [sourceTagId]);
      context.db.run("DELETE FROM tags WHERE id = ? AND library_id = ?", [sourceTagId, context.library.id]);
      recordSuccess(result);
    }
    return result;
  }

  async deleteTags(tagIds: string[]): Promise<BatchResult> {
    const context = this.libraryService.requireActive();
    const result = createBatchResult(tagIds.length);
    for (const tagId of tagIds) {
      const tag = context.db.get<{ id: string }>("SELECT id FROM tags WHERE id = ? AND library_id = ?", [
        tagId,
        context.library.id,
      ]);
      if (!tag) {
        recordFailure(result, tagId, "Tag not found.");
        continue;
      }
      context.db.run("DELETE FROM asset_tags WHERE tag_id = ?", [tagId]);
      context.db.run("DELETE FROM tags WHERE id = ? AND library_id = ?", [tagId, context.library.id]);
      recordSuccess(result);
    }
    return result;
  }

  async deleteUnusedTags(): Promise<BatchResult> {
    const unused = (await this.listTagsWithUsage()).filter((tag) => tag.assetCount === 0);
    return this.deleteTags(unused.map((tag) => tag.id));
  }

  createRecommendationRepository(): AssetTagRepository {
    return {
      findTagByName: async (name) => this.findTagByNameSync(name),
      createTag: async (name) => this.createTag({ name }),
      getAssetTags: async (assetId) => this.getAssetTags(assetId),
      linkTagToAsset: async (assetId, tagId) => {
        this.libraryService.requireActive().db.run(
          "INSERT OR IGNORE INTO asset_tags (asset_id, tag_id, created_at) VALUES (?, ?, ?)",
          [assetId, tagId, new Date().toISOString()],
        );
      },
    };
  }

  private getAssetTags(assetId: string): TagRecord[] {
    const context = this.libraryService.requireActive();
    return context.db.all<TagRow>(
      `
      SELECT t.*
      FROM tags t
      JOIN asset_tags at ON at.tag_id = t.id
      WHERE at.asset_id = ?
      ORDER BY t.name COLLATE NOCASE
      `,
      [assetId],
    ).map(mapTagRow);
  }

  private findTagByNameSync(name: string): TagRecord | null {
    const context = this.libraryService.requireActive();
    const row = context.db.get<TagRow>(
      "SELECT * FROM tags WHERE library_id = ? AND name = ? COLLATE NOCASE",
      [context.library.id, normalizeTagName(name)],
    );
    return row ? mapTagRow(row) : null;
  }
}

function normalizeTagName(value: string): string {
  return value.trim();
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return hash;
}
