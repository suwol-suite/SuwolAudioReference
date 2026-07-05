import { randomUUID } from "node:crypto";
import type { BatchResult } from "../../shared/library-types";
import type {
  GameEngineType,
  SoundUsageCustomTemplateInput,
  SoundUsageItemInput,
  SoundUsageTemplate,
  SoundUsageTemplateApplyInput,
  SoundUsageTemplateApplyPreview,
} from "../../shared/sound-board-types";
import { createBatchResult, recordFailure, recordSkipped, recordSuccess } from "./batch-result";
import { GameProjectService } from "./game-project-service";
import type { LibraryService } from "./library-service";
import { coerceGameEngine } from "./sound-board-helpers";
import { SoundUsageService, SOUND_USAGE_TEMPLATES } from "./sound-usage-service";
import type { AssetService } from "./asset-service";

interface TemplateRow {
  id: string;
  library_id: string;
  name: string;
  description: string;
  engine_type: string;
  items_json: string;
  created_at: string;
  updated_at: string;
}

export class SoundUsageTemplateService {
  private readonly usageService: SoundUsageService;
  private readonly projectService: GameProjectService;

  constructor(
    private readonly libraryService: LibraryService,
    assetService: AssetService,
  ) {
    this.usageService = new SoundUsageService(libraryService, assetService);
    this.projectService = new GameProjectService(libraryService);
  }

  listTemplates(): SoundUsageTemplate[] {
    const context = this.libraryService.requireActive();
    const rows = context.db.all<TemplateRow>(
      "SELECT * FROM sound_usage_templates WHERE library_id = ? ORDER BY name COLLATE NOCASE",
      [context.library.id],
    );
    return [
      ...SOUND_USAGE_TEMPLATES.map((template) => ({ ...template, builtIn: true })),
      ...rows.map(mapTemplateRow),
    ];
  }

  async createFromProject(input: SoundUsageCustomTemplateInput): Promise<SoundUsageTemplate> {
    const context = this.libraryService.requireActive();
    const project = this.projectService.getProject(input.projectId);
    if (!project) {
      throw new Error("PROJECT_NOT_FOUND");
    }
    const name = input.name.trim();
    if (!name) {
      throw new Error("TEMPLATE_NAME_REQUIRED");
    }
    const items = await this.usageService.listItems({ projectId: input.projectId });
    const templateItems: Omit<SoundUsageItemInput, "projectId">[] = items.map((item) => ({
      key: item.key,
      displayName: item.displayName,
      category: item.category,
      description: item.description,
      required: item.required,
      status: "missing",
      priority: item.priority,
      loopRequired: item.loopRequired,
      variantsAllowed: item.variantsAllowed,
      targetDurationMs: item.targetDurationMs,
      targetLoudnessNote: item.targetLoudnessNote,
      notes: item.notes,
    }));
    const now = new Date().toISOString();
    const id = randomUUID();
    context.db.run(
      `
      INSERT INTO sound_usage_templates (
        id, library_id, name, description, engine_type, items_json, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        context.library.id,
        name,
        input.description?.trim() ?? "",
        project.engineType,
        JSON.stringify(templateItems),
        now,
        now,
      ],
    );
    return this.getCustomTemplate(id);
  }

  async previewApply(input: SoundUsageTemplateApplyInput): Promise<SoundUsageTemplateApplyPreview> {
    const template = this.getTemplate(input.templateId);
    const existingItems = await this.usageService.listItems({ projectId: input.projectId });
    const existingKeys = new Set(existingItems.map((item) => item.key));
    const conflictMode = input.conflictMode ?? "skip";
    const rows = template.items.map((item, index) => {
      const exists = existingKeys.has(item.key);
      const action: "create" | "update" | "skip" = exists ? (conflictMode === "update" ? "update" : "skip") : "create";
      return {
        lineNumber: index + 1,
        raw: item.key,
        key: item.key,
        suggestedKey: item.key,
        displayName: item.displayName ?? item.key,
        category: item.category ?? "sfx",
        priority: item.priority ?? "normal",
        loopRequired: item.loopRequired ?? false,
        valid: true,
        exists,
        action,
        warnings: exists ? ["already exists"] : [],
      };
    });
    return {
      template,
      projectId: input.projectId,
      createCount: rows.filter((row) => row.action === "create").length,
      updateCount: rows.filter((row) => row.action === "update").length,
      skipCount: rows.filter((row) => row.action === "skip").length,
      rows,
      warnings: Array.from(new Set(rows.flatMap((row) => row.warnings))),
    };
  }

  async apply(input: SoundUsageTemplateApplyInput): Promise<BatchResult> {
    const preview = await this.previewApply(input);
    const result = createBatchResult(preview.rows.length);
    for (const row of preview.rows) {
      const item = preview.template.items[row.lineNumber - 1];
      if (!item || row.action === "skip") {
        recordSkipped(result, `${row.key}: skipped`);
        continue;
      }
      try {
        if (row.action === "update") {
          const current = (await this.usageService.listItems({ projectId: input.projectId, search: row.key })).find(
            (usageItem) => usageItem.key === row.key,
          );
          if (!current) {
            recordSkipped(result, `${row.key}: existing item disappeared`);
            continue;
          }
          await this.usageService.updateItem(current.id, item);
        } else {
          await this.usageService.createItem({ ...item, projectId: input.projectId });
        }
        recordSuccess(result);
      } catch (error) {
        recordFailure(result, row.key, error instanceof Error ? error.message : String(error));
      }
    }
    return result;
  }

  rename(templateId: string, name: string): SoundUsageTemplate {
    if (this.isBuiltIn(templateId)) {
      throw new Error("BUILT_IN_TEMPLATE_READONLY");
    }
    const context = this.libraryService.requireActive();
    context.db.run(
      "UPDATE sound_usage_templates SET name = ?, updated_at = ? WHERE id = ? AND library_id = ?",
      [name.trim(), new Date().toISOString(), templateId, context.library.id],
    );
    return this.getCustomTemplate(templateId);
  }

  delete(templateId: string): BatchResult {
    const result = createBatchResult(1);
    if (this.isBuiltIn(templateId)) {
      recordSkipped(result, "Built-in templates cannot be deleted.");
      return result;
    }
    const context = this.libraryService.requireActive();
    context.db.run("DELETE FROM sound_usage_templates WHERE id = ? AND library_id = ?", [templateId, context.library.id]);
    recordSuccess(result);
    return result;
  }

  private getTemplate(templateId: string): SoundUsageTemplate {
    const builtIn = SOUND_USAGE_TEMPLATES.find((template) => template.id === templateId);
    if (builtIn) {
      return { ...builtIn, builtIn: true };
    }
    return this.getCustomTemplate(templateId);
  }

  private getCustomTemplate(templateId: string): SoundUsageTemplate {
    const context = this.libraryService.requireActive();
    const row = context.db.get<TemplateRow>("SELECT * FROM sound_usage_templates WHERE id = ? AND library_id = ?", [
      templateId,
      context.library.id,
    ]);
    if (!row) {
      throw new Error("TEMPLATE_NOT_FOUND");
    }
    return mapTemplateRow(row);
  }

  private isBuiltIn(templateId: string): boolean {
    return SOUND_USAGE_TEMPLATES.some((template) => template.id === templateId);
  }
}

function mapTemplateRow(row: TemplateRow): SoundUsageTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    engineType: coerceGameEngine(row.engine_type) as GameEngineType,
    builtIn: false,
    items: parseItems(row.items_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseItems(value: string): Omit<SoundUsageItemInput, "projectId">[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as Omit<SoundUsageItemInput, "projectId">[]) : [];
  } catch {
    return [];
  }
}
