import { access } from "node:fs/promises";
import type { LibraryDiagnostics } from "../../shared/library-types";
import type { LibraryService } from "./library-service";
import type { LoggerService } from "./logger-service";

interface AssetPathRow {
  id: string;
  import_mode: "copy" | "link";
  original_path: string;
  stored_path: string | null;
  media_type: string;
}

export class DiagnosticsService {
  constructor(
    private readonly libraryService: LibraryService,
    private readonly loggerService: LoggerService,
  ) {}

  async runLibraryDiagnostics(): Promise<LibraryDiagnostics | null> {
    const context = this.libraryService.getActive();
    if (!context) {
      return null;
    }

    const dbIntegrity = context.db.get<{ integrity_check: string }>("PRAGMA integrity_check;")?.integrity_check ?? "unknown";
    const migrationVersion =
      context.db.get<{ id: string }>("SELECT id FROM schema_migrations ORDER BY applied_at DESC LIMIT 1")?.id ??
      "unknown";
    const assets = context.db.all<AssetPathRow>(
      "SELECT id, import_mode, original_path, stored_path, media_type FROM assets WHERE library_id = ? AND trashed_at IS NULL",
      [context.library.id],
    );
    let missingFiles = 0;
    let copyAssetsMissingFiles = 0;
    const checkedAt = new Date().toISOString();

    for (const asset of assets) {
      const expectedPath = asset.import_mode === "copy" ? asset.stored_path : asset.original_path;
      let missing = false;
      try {
        if (!expectedPath) {
          missing = true;
        } else {
          await access(expectedPath);
        }
      } catch {
        missing = true;
      }

      context.db.run(
        `
        UPDATE assets
        SET file_missing = ?, file_missing_checked_at = ?
        WHERE id = ? AND library_id = ?
        `,
        [missing ? 1 : 0, checkedAt, asset.id, context.library.id],
      );

      if (missing) {
        missingFiles += 1;
        if (asset.import_mode === "copy") {
          copyAssetsMissingFiles += 1;
        }
      }
    }

    const assetCount = context.db.get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM assets WHERE library_id = ?",
      [context.library.id],
    )?.count ?? 0;
    const analysisMissing = context.db.get<{ count: number }>(
      `
      SELECT COUNT(*) AS count
      FROM assets a
      LEFT JOIN asset_audio_analysis aa ON aa.asset_id = a.id
      WHERE a.library_id = ? AND a.trashed_at IS NULL AND aa.asset_id IS NULL
      `,
      [context.library.id],
    )?.count ?? 0;
    const analysisFailed = context.db.get<{ count: number }>(
      `
      SELECT COUNT(DISTINCT asset_id) AS count
      FROM import_warnings
      WHERE asset_id IS NOT NULL
      `,
    )?.count ?? 0;
    const unplayableAssets = context.db.get<{ count: number }>(
      `
      SELECT COUNT(*) AS count
      FROM assets
      WHERE library_id = ?
        AND trashed_at IS NULL
        AND (playback_supported = 0 OR file_missing = 1 OR media_type != 'audio')
      `,
      [context.library.id],
    )?.count ?? 0;
    const trashedAssets = context.db.get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM assets WHERE library_id = ? AND trashed_at IS NOT NULL",
      [context.library.id],
    )?.count ?? 0;
    const duplicateHashes = context.db.get<{ count: number }>(
      `
      SELECT COUNT(*) AS count
      FROM (
        SELECT content_hash
        FROM assets
        WHERE library_id = ?
        GROUP BY content_hash
        HAVING COUNT(*) > 1
      )
      `,
      [context.library.id],
    )?.count ?? 0;
    const duplicateGroups = duplicateHashes;
    const orphanTags = context.db.get<{ count: number }>(
      `
      SELECT COUNT(*) AS count
      FROM asset_tags at
      LEFT JOIN assets a ON a.id = at.asset_id
      LEFT JOIN tags t ON t.id = at.tag_id
      WHERE a.id IS NULL OR t.id IS NULL
      `,
    )?.count ?? 0;
    const orphanCollectionRelations = context.db.get<{ count: number }>(
      `
      SELECT COUNT(*) AS count
      FROM collection_assets ca
      LEFT JOIN assets a ON a.id = ca.asset_id
      LEFT JOIN collections c ON c.id = ca.collection_id
      WHERE a.id IS NULL OR c.id IS NULL
      `,
    )?.count ?? 0;
    const orphanAnalysisRows = context.db.get<{ count: number }>(
      `
      SELECT COUNT(*) AS count
      FROM asset_audio_analysis aa
      LEFT JOIN assets a ON a.id = aa.asset_id
      WHERE a.id IS NULL
      `,
    )?.count ?? 0;
    const waveformMissing = context.db.get<{ count: number }>(
      `
      SELECT COUNT(*) AS count
      FROM assets a
      JOIN asset_audio_analysis aa ON aa.asset_id = a.id
      WHERE a.library_id = ? AND a.media_type = 'audio' AND a.trashed_at IS NULL AND aa.waveform_summary_json IS NULL
      `,
      [context.library.id],
    )?.count ?? 0;
    const importWarnings = context.db.get<{ count: number }>("SELECT COUNT(*) AS count FROM import_warnings")?.count ?? 0;
    const diagnostics = {
      ok:
        dbIntegrity === "ok" &&
        missingFiles === 0 &&
        orphanTags === 0 &&
        orphanCollectionRelations === 0 &&
        orphanAnalysisRows === 0,
      dbIntegrity,
      migrationVersion,
      assetCount,
      missingFiles,
      analysisMissing,
      analysisFailed,
      unplayableAssets,
      trashedAssets,
      duplicateHashes,
      duplicateGroups,
      orphanTags,
      orphanCollectionRelations,
      orphanAnalysisRows,
      copyAssetsMissingFiles,
      waveformMissing,
      importWarnings,
      repairableItems: [
        { id: "missing", label: "Missing files", count: missingFiles, action: "markMissing" as const },
        { id: "orphan-tags", label: "Orphan tag links", count: orphanTags, action: "clearOrphans" as const },
        {
          id: "orphan-collections",
          label: "Orphan collection links",
          count: orphanCollectionRelations,
          action: "clearOrphans" as const,
        },
        { id: "orphan-analysis", label: "Orphan analysis rows", count: orphanAnalysisRows, action: "clearOrphans" as const },
      ].filter((item) => item.count > 0),
      logPath: this.loggerService.logPath,
    };

    await this.loggerService.info(
      `diagnostics ok=${diagnostics.ok} db=${dbIntegrity} missing=${missingFiles} analysisMissing=${analysisMissing} trashed=${trashedAssets}`,
    );

    return diagnostics;
  }
}
