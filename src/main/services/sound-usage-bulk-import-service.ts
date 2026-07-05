import type { BatchResult } from "../../shared/library-types";
import type {
  SoundUsageBulkCreateInput,
  SoundUsageBulkPreview,
  SoundUsageBulkPreviewInput,
  SoundUsageBulkPreviewRow,
  SoundUsageCategory,
  SoundUsageItemInput,
  SoundUsagePriority,
} from "../../shared/sound-board-types";
import { createBatchResult, recordFailure, recordSkipped, recordSuccess } from "./batch-result";
import type { AssetService } from "./asset-service";
import type { LibraryService } from "./library-service";
import {
  coerceUsageCategory,
  coerceUsagePriority,
  isValidUsageKey,
  sanitizeUsageKey,
  SOUND_USAGE_CATEGORIES,
  SOUND_USAGE_PRIORITIES,
} from "./sound-board-helpers";
import { SoundUsageService } from "./sound-usage-service";

interface ExistingKeyRow {
  key: string;
}

export class SoundUsageBulkImportService {
  private readonly usageService: SoundUsageService;

  constructor(libraryService: LibraryService, assetService: AssetService) {
    this.libraryService = libraryService;
    this.usageService = new SoundUsageService(libraryService, assetService);
  }

  private readonly libraryService: LibraryService;

  preview(input: SoundUsageBulkPreviewInput): SoundUsageBulkPreview {
    const rows = parseBulkUsageText(input.text);
    const skipped = countSkippedLines(input.text);
    const existingKeys = this.loadExistingKeys(input.projectId);
    const seen = new Map<string, number>();
    const conflictMode = input.conflictMode ?? "skip";
    const previewRows: SoundUsageBulkPreviewRow[] = rows.map((row) => {
      const suggestedKey = sanitizeUsageKey(row.key);
      const warnings = [...row.warnings];
      const valid = Boolean(row.key.trim()) && isValidUsageKey(suggestedKey);
      if (!valid) {
        warnings.push("invalid key");
      }
      if (row.key && row.key !== suggestedKey) {
        warnings.push(`suggested key: ${suggestedKey}`);
      }
      const duplicateLine = seen.has(suggestedKey);
      seen.set(suggestedKey, (seen.get(suggestedKey) ?? 0) + 1);
      if (duplicateLine) {
        warnings.push("duplicate in pasted text");
      }
      const exists = existingKeys.has(suggestedKey);
      if (exists) {
        warnings.push("already exists");
      }
      const action: SoundUsageBulkPreviewRow["action"] =
        !valid || duplicateLine ? "skip" : exists ? (conflictMode === "update" ? "update" : "skip") : "create";
      return {
        lineNumber: row.lineNumber,
        raw: row.raw,
        key: row.key,
        suggestedKey,
        displayName: row.displayName || suggestedKey,
        category: row.category,
        priority: row.priority,
        loopRequired: row.loopRequired,
        valid,
        exists,
        action,
        warnings,
      };
    });
    return {
      projectId: input.projectId,
      validCount: previewRows.filter((row) => row.valid).length,
      createCount: previewRows.filter((row) => row.action === "create").length,
      updateCount: previewRows.filter((row) => row.action === "update").length,
      skipCount: previewRows.filter((row) => row.action === "skip").length,
      alreadyExistsCount: previewRows.filter((row) => row.exists).length,
      duplicateCount: previewRows.filter((row) => row.warnings.some((warning) => warning.includes("duplicate"))).length,
      invalidCount: previewRows.filter((row) => !row.valid).length,
      unknownCategoryCount: previewRows.filter((row) => row.warnings.some((warning) => warning.includes("unknown category"))).length,
      unknownPriorityCount: previewRows.filter((row) => row.warnings.some((warning) => warning.includes("unknown priority"))).length,
      loopDetectedCount: previewRows.filter((row) => row.loopRequired).length,
      blankLineCount: skipped.blank,
      commentLineCount: skipped.comment,
      rows: previewRows,
      warnings: Array.from(new Set(previewRows.flatMap((row) => row.warnings))),
    };
  }

  async create(input: SoundUsageBulkCreateInput): Promise<BatchResult> {
    if (!input.confirmed) {
      throw new Error("USAGE_BULK_CONFIRM_REQUIRED");
    }
    const preview = this.preview(input);
    const actionable = preview.rows.filter((row) => row.action !== "skip");
    const result = createBatchResult(preview.rows.length);
    for (const row of preview.rows) {
      if (row.action === "skip") {
        recordSkipped(result, `${row.lineNumber}: ${row.warnings.join("; ") || "skipped"}`);
        continue;
      }
      try {
        const item: SoundUsageItemInput = {
          projectId: input.projectId,
          key: row.suggestedKey,
          displayName: row.displayName,
          category: row.category,
          priority: row.priority,
          loopRequired: row.loopRequired,
        };
        if (row.action === "update") {
          const existing = await findExistingItem(this.usageService, input.projectId, row.suggestedKey);
          if (!existing) {
            recordSkipped(result, `${row.lineNumber}: existing item disappeared`);
            continue;
          }
          await this.usageService.updateItem(existing.id, item);
        } else {
          await this.usageService.createItem(item);
        }
        recordSuccess(result);
      } catch (error) {
        recordFailure(result, row.suggestedKey, error instanceof Error ? error.message : String(error));
      }
    }
    if (actionable.length === 0) {
      result.warnings.push("No rows were created or updated.");
    }
    return result;
  }

  private loadExistingKeys(projectId: string): Set<string> {
    const context = this.libraryService.requireActive();
    const rows = context.db.all<ExistingKeyRow>(
      "SELECT key FROM sound_usage_items WHERE project_id = ? AND library_id = ? AND archived_at IS NULL",
      [projectId, context.library.id],
    );
    return new Set(rows.map((row) => row.key));
  }
}

export function parseBulkUsageText(text: string): Array<{
  lineNumber: number;
  raw: string;
  key: string;
  displayName: string;
  category: SoundUsageCategory;
  priority: SoundUsagePriority;
  loopRequired: boolean;
  warnings: string[];
}> {
  return text
    .split(/\r?\n/)
    .map((raw, index) => ({ raw: raw.trim(), lineNumber: index + 1 }))
    .filter((row) => row.raw && !row.raw.startsWith("#"))
    .map((row) => parseBulkLine(row.raw, row.lineNumber));
}

function parseBulkLine(raw: string, lineNumber: number): ReturnType<typeof parseBulkUsageText>[number] {
  const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
  const key = parts[0] ?? "";
  const warnings: string[] = [];
  const categoryText = parts[1]?.toLowerCase();
  const category = SOUND_USAGE_CATEGORIES.includes(categoryText as SoundUsageCategory)
    ? (categoryText as SoundUsageCategory)
    : inferCategoryFromKey(key);
  if (categoryText && !SOUND_USAGE_CATEGORIES.includes(categoryText as SoundUsageCategory)) {
    warnings.push(`unknown category: ${parts[1]}`);
  }
  const priorityText = parts.find((part) => SOUND_USAGE_PRIORITIES.includes(part.toLowerCase() as SoundUsagePriority))?.toLowerCase();
  const unknownPriorityText = parts
    .slice(3)
    .find((part) => !SOUND_USAGE_PRIORITIES.includes(part.toLowerCase() as SoundUsagePriority) && !isLoopToken(part));
  if (!priorityText && unknownPriorityText) {
    warnings.push(`unknown priority: ${unknownPriorityText}`);
  }
  const priority = priorityText ? coerceUsagePriority(priorityText) : "normal";
  const loopRequired = parts.some(isLoopToken);
  return {
    lineNumber,
    raw,
    key,
    displayName: parts[2] && !SOUND_USAGE_PRIORITIES.includes(parts[2].toLowerCase() as SoundUsagePriority) ? parts[2] : key,
    category: coerceUsageCategory(category),
    priority,
    loopRequired,
    warnings,
  };
}

function countSkippedLines(text: string): { blank: number; comment: number } {
  return text.split(/\r?\n/).reduce(
    (result, line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        result.blank += 1;
      } else if (trimmed.startsWith("#")) {
        result.comment += 1;
      }
      return result;
    },
    { blank: 0, comment: 0 },
  );
}

function isLoopToken(value: string): boolean {
  const normalized = value.toLowerCase();
  return normalized === "loop" || normalized === "loop_required";
}

function inferCategoryFromKey(key: string): SoundUsageCategory {
  const normalized = key.toLowerCase();
  if (normalized.includes("ui.")) {
    return "ui";
  }
  if (normalized.includes("bgm") || normalized.includes("music")) {
    return "bgm";
  }
  if (normalized.includes("ambience") || normalized.includes("ambient")) {
    return "ambience";
  }
  if (normalized.includes("voice")) {
    return "voice";
  }
  return "sfx";
}

async function findExistingItem(usageService: SoundUsageService, projectId: string, key: string) {
  const items = await usageService.listItems({ projectId, search: key });
  return items.find((item) => item.key === key) ?? null;
}
