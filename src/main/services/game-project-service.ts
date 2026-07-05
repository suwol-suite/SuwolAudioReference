import { randomUUID } from "node:crypto";
import type {
  GameProjectInput,
  GameProjectRecord,
  GameProjectUpdateInput,
  SoundBoardSummary,
} from "../../shared/sound-board-types";
import type { LibraryService } from "./library-service";
import {
  coerceGameEngine,
  coerceProjectExportFormat,
  normalizeOptionalText,
} from "./sound-board-helpers";

export interface GameProjectRow {
  id: string;
  library_id: string;
  name: string;
  description: string;
  engine_type: string;
  root_namespace: string;
  default_export_format: string;
  baseline_snapshot_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

interface SummaryRow {
  total: number;
  required_count: number;
  missing_count: number;
  needs_candidates_count: number;
  reviewing_count: number;
  selected_count: number;
  approved_count: number;
  rejected_count: number;
  deferred_count: number;
  required_missing_count: number;
  no_candidates_count: number;
}

export class GameProjectService {
  constructor(private readonly libraryService: LibraryService) {}

  listProjects(includeArchived = false): GameProjectRecord[] {
    const context = this.libraryService.requireActive();
    const rows = context.db.all<GameProjectRow>(
      `
      SELECT *
      FROM game_projects
      WHERE library_id = ?
        AND (? = 1 OR archived_at IS NULL)
      ORDER BY archived_at IS NOT NULL ASC, updated_at DESC, name COLLATE NOCASE
      `,
      [context.library.id, includeArchived ? 1 : 0],
    );
    return rows.map(mapGameProjectRow);
  }

  getProject(projectId: string): GameProjectRecord | null {
    const context = this.libraryService.requireActive();
    const row = context.db.get<GameProjectRow>("SELECT * FROM game_projects WHERE id = ? AND library_id = ?", [
      projectId,
      context.library.id,
    ]);
    return row ? mapGameProjectRow(row) : null;
  }

  createProject(input: GameProjectInput): GameProjectRecord {
    const context = this.libraryService.requireActive();
    const name = input.name.trim();
    if (!name) {
      throw new Error("PROJECT_NAME_REQUIRED");
    }
    const now = new Date().toISOString();
    const id = randomUUID();
    context.db.run(
      `
      INSERT INTO game_projects (
        id, library_id, name, description, engine_type, root_namespace,
        default_export_format, created_at, updated_at, archived_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `,
      [
        id,
        context.library.id,
        name,
        normalizeOptionalText(input.description),
        coerceGameEngine(input.engineType),
        normalizeOptionalText(input.rootNamespace),
        coerceProjectExportFormat(input.defaultExportFormat),
        now,
        now,
      ],
    );
    const created = this.getProject(id);
    if (!created) {
      throw new Error("PROJECT_CREATE_FAILED");
    }
    return created;
  }

  updateProject(projectId: string, input: GameProjectUpdateInput): GameProjectRecord {
    const current = this.getProject(projectId);
    if (!current) {
      throw new Error("PROJECT_NOT_FOUND");
    }
    const context = this.libraryService.requireActive();
    const nextName = input.name === undefined ? current.name : input.name.trim();
    if (!nextName) {
      throw new Error("PROJECT_NAME_REQUIRED");
    }
    context.db.run(
      `
      UPDATE game_projects
      SET name = ?,
          description = ?,
          engine_type = ?,
          root_namespace = ?,
          default_export_format = ?,
          baseline_snapshot_id = ?,
          updated_at = ?
      WHERE id = ? AND library_id = ?
      `,
      [
        nextName,
        input.description === undefined ? current.description : normalizeOptionalText(input.description),
        input.engineType === undefined ? current.engineType : coerceGameEngine(input.engineType),
        input.rootNamespace === undefined ? current.rootNamespace : normalizeOptionalText(input.rootNamespace),
        input.defaultExportFormat === undefined
          ? current.defaultExportFormat
          : coerceProjectExportFormat(input.defaultExportFormat),
        input.baselineSnapshotId === undefined ? current.baselineSnapshotId : input.baselineSnapshotId,
        new Date().toISOString(),
        projectId,
        context.library.id,
      ],
    );
    const updated = this.getProject(projectId);
    if (!updated) {
      throw new Error("PROJECT_UPDATE_FAILED");
    }
    return updated;
  }

  archiveProject(projectId: string): GameProjectRecord {
    const context = this.libraryService.requireActive();
    if (!this.getProject(projectId)) {
      throw new Error("PROJECT_NOT_FOUND");
    }
    const now = new Date().toISOString();
    context.db.run(
      `
      UPDATE game_projects
      SET archived_at = ?, updated_at = ?
      WHERE id = ? AND library_id = ?
      `,
      [now, now, projectId, context.library.id],
    );
    context.db.run(
      `
      UPDATE sound_usage_items
      SET archived_at = COALESCE(archived_at, ?), updated_at = ?
      WHERE project_id = ? AND library_id = ? AND archived_at IS NULL
      `,
      [now, now, projectId, context.library.id],
    );
    const archived = this.getProject(projectId);
    if (!archived) {
      throw new Error("PROJECT_ARCHIVE_FAILED");
    }
    return archived;
  }

  getSummary(projectId: string): SoundBoardSummary {
    const context = this.libraryService.requireActive();
    const row = context.db.get<SummaryRow>(
      `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN required = 1 THEN 1 ELSE 0 END) AS required_count,
        SUM(CASE WHEN status = 'missing' THEN 1 ELSE 0 END) AS missing_count,
        SUM(CASE WHEN status = 'needs_candidates' THEN 1 ELSE 0 END) AS needs_candidates_count,
        SUM(CASE WHEN status = 'reviewing' THEN 1 ELSE 0 END) AS reviewing_count,
        SUM(CASE WHEN status = 'selected' THEN 1 ELSE 0 END) AS selected_count,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved_count,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected_count,
        SUM(CASE WHEN status = 'deferred' THEN 1 ELSE 0 END) AS deferred_count,
        SUM(CASE WHEN required = 1 AND status IN ('missing', 'needs_candidates') THEN 1 ELSE 0 END) AS required_missing_count,
        SUM(CASE WHEN NOT EXISTS (
          SELECT 1 FROM sound_usage_candidates c WHERE c.usage_item_id = sound_usage_items.id
        ) THEN 1 ELSE 0 END) AS no_candidates_count
      FROM sound_usage_items
      WHERE project_id = ? AND library_id = ? AND archived_at IS NULL
      `,
      [projectId, context.library.id],
    );
    return {
      projectId,
      total: row?.total ?? 0,
      required: row?.required_count ?? 0,
      missing: row?.missing_count ?? 0,
      needsCandidates: row?.needs_candidates_count ?? 0,
      reviewing: row?.reviewing_count ?? 0,
      selected: row?.selected_count ?? 0,
      approved: row?.approved_count ?? 0,
      rejected: row?.rejected_count ?? 0,
      deferred: row?.deferred_count ?? 0,
      requiredMissing: row?.required_missing_count ?? 0,
      noCandidates: row?.no_candidates_count ?? 0,
    };
  }
}

export function mapGameProjectRow(row: GameProjectRow): GameProjectRecord {
  return {
    id: row.id,
    libraryId: row.library_id,
    name: row.name,
    description: row.description,
    engineType: coerceGameEngine(row.engine_type),
    rootNamespace: row.root_namespace,
    defaultExportFormat: coerceProjectExportFormat(row.default_export_format),
    baselineSnapshotId: row.baseline_snapshot_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}
