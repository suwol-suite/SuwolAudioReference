import { randomUUID } from "node:crypto";
import type {
  SoundProjectChecklistItemInput,
  SoundProjectChecklistItemRecord,
  SoundProjectChecklistItemUpdateInput,
  SoundProjectChecklistListResult,
} from "../../shared/sound-board-types";
import { GameProjectService } from "./game-project-service";
import type { LibraryService } from "./library-service";
import { boolToInt, intToBool, normalizeOptionalText } from "./sound-board-helpers";

export const BUILT_IN_SOUND_CHECKLIST_LABELS = [
  "UI sound length checked",
  "BGM loop checked",
  "Peak/RMS checked",
  "License/source checked",
  "Variation needs checked",
  "Usage key naming checked",
  "Selected asset playback checked",
  "Export preview checked",
];

interface ChecklistRow {
  id: string;
  project_id: string;
  label: string;
  checked: number;
  note: string;
  sort_order: number;
  built_in: number;
  created_at: string;
  updated_at: string;
}

export class SoundChecklistService {
  private readonly projectService: GameProjectService;

  constructor(private readonly libraryService: LibraryService) {
    this.projectService = new GameProjectService(libraryService);
  }

  list(projectId: string): SoundProjectChecklistListResult {
    this.requireProject(projectId);
    const context = this.libraryService.requireActive();
    const rows = context.db.all<ChecklistRow>(
      `
      SELECT *
      FROM sound_project_checklist_items
      WHERE project_id = ?
      ORDER BY sort_order ASC, created_at ASC
      `,
      [projectId],
    );
    return {
      projectId,
      builtInLabels: BUILT_IN_SOUND_CHECKLIST_LABELS,
      items: rows.map(mapChecklistRow),
    };
  }

  addBuiltins(projectId: string): SoundProjectChecklistListResult {
    this.requireProject(projectId);
    const context = this.libraryService.requireActive();
    const existing = new Set(
      context.db
        .all<{ label: string }>("SELECT label FROM sound_project_checklist_items WHERE project_id = ?", [projectId])
        .map((row) => row.label.trim().toLowerCase()),
    );
    const now = new Date().toISOString();
    context.db.transaction(() => {
      BUILT_IN_SOUND_CHECKLIST_LABELS.forEach((label, index) => {
        if (existing.has(label.toLowerCase())) {
          return;
        }
        context.db.run(
          `
          INSERT INTO sound_project_checklist_items (
            id, project_id, label, checked, note, sort_order, built_in, created_at, updated_at
          )
          VALUES (?, ?, ?, 0, '', ?, 1, ?, ?)
          `,
          [randomUUID(), projectId, label, index, now, now],
        );
      });
    });
    return this.list(projectId);
  }

  create(input: SoundProjectChecklistItemInput): SoundProjectChecklistItemRecord {
    this.requireProject(input.projectId);
    const context = this.libraryService.requireActive();
    const now = new Date().toISOString();
    const id = randomUUID();
    context.db.run(
      `
      INSERT INTO sound_project_checklist_items (
        id, project_id, label, checked, note, sort_order, built_in, created_at, updated_at
      )
      VALUES (?, ?, ?, 0, ?, ?, 0, ?, ?)
      `,
      [
        id,
        input.projectId,
        normalizeOptionalText(input.label) || "Checklist item",
        normalizeOptionalText(input.note),
        input.sortOrder ?? 1000,
        now,
        now,
      ],
    );
    return this.get(id);
  }

  update(itemId: string, input: SoundProjectChecklistItemUpdateInput): SoundProjectChecklistItemRecord {
    const current = this.get(itemId);
    const context = this.libraryService.requireActive();
    context.db.run(
      `
      UPDATE sound_project_checklist_items
      SET label = ?,
          checked = ?,
          note = ?,
          sort_order = ?,
          updated_at = ?
      WHERE id = ?
      `,
      [
        input.label === undefined ? current.label : normalizeOptionalText(input.label) || current.label,
        input.checked === undefined ? boolToInt(current.checked) : boolToInt(input.checked),
        input.note === undefined ? current.note : normalizeOptionalText(input.note),
        input.sortOrder === undefined ? current.sortOrder : input.sortOrder,
        new Date().toISOString(),
        itemId,
      ],
    );
    return this.get(itemId);
  }

  delete(itemId: string): boolean {
    const context = this.libraryService.requireActive();
    context.db.run("DELETE FROM sound_project_checklist_items WHERE id = ?", [itemId]);
    return true;
  }

  createMarkdown(projectId: string): string {
    const project = this.requireProject(projectId);
    const list = this.list(projectId);
    const lines = [
      "# Project Sound Checklist",
      "",
      `Project: ${escapeMarkdown(project.name)}`,
      "",
      ...(list.items.length
        ? list.items.map((item) => `- [${item.checked ? "x" : " "}] ${escapeMarkdown(item.label)}${item.note ? ` - ${escapeMarkdown(item.note)}` : ""}`)
        : ["- [ ] TODO: Add checklist items"]),
      "",
    ];
    return lines.join("\n");
  }

  isIncomplete(projectId: string): boolean {
    const items = this.list(projectId).items;
    return items.length === 0 || items.some((item) => !item.checked);
  }

  private get(itemId: string): SoundProjectChecklistItemRecord {
    const context = this.libraryService.requireActive();
    const row = context.db.get<ChecklistRow>("SELECT * FROM sound_project_checklist_items WHERE id = ?", [itemId]);
    if (!row) {
      throw new Error("CHECKLIST_ITEM_NOT_FOUND");
    }
    return mapChecklistRow(row);
  }

  private requireProject(projectId: string) {
    const project = this.projectService.getProject(projectId);
    if (!project) {
      throw new Error("PROJECT_NOT_FOUND");
    }
    return project;
  }
}

function mapChecklistRow(row: ChecklistRow): SoundProjectChecklistItemRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    label: row.label,
    checked: intToBool(row.checked),
    note: row.note,
    sortOrder: row.sort_order,
    builtIn: intToBool(row.built_in),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function escapeMarkdown(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
