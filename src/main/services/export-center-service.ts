import { randomUUID } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import type { AssetListItem, AssetListQuery, BatchResult, LibraryRecord } from "../../shared/library-types";
import type {
  AssetRightsInput,
  AssetRightsMetadata,
  CodexInstructionPreviewInput,
  ExportHistoryListQuery,
  ExportHistoryRecord,
  ExportOptions,
  ExportPresetInput,
  ExportPresetRecord,
  ExportPreview,
  ExportRunResult,
  ExportRunSummary,
  ExportSource,
  ExportTargetType,
  ExportValidationIssue,
  ManifestPreviewInput,
  PlannedExportFile,
  ProjectExportSourceSummary,
} from "../../shared/export-types";
import type { ProjectSoundPackDryRun, ProjectSoundPackExportResult, ProjectSoundPackOptions } from "../../shared/project-sound-pack-types";
import type {
  SoundBoardExportOptions,
  SoundBoardExportPreview,
  SoundBoardExportResult,
  SoundRequestExportOptions,
  SoundRequestExportPreview,
  SoundRequestExportResult,
} from "../../shared/sound-board-types";
import type { LibraryService } from "./library-service";
import type { AssetService } from "./asset-service";
import { createBatchResult, recordFailure, recordSuccess } from "./batch-result";
import { CodexInstructionExportService } from "./codex-instruction-export-service";
import {
  GameAudioManifestService,
  safeFileName,
  sanitizeEngineKey,
  toCsv,
} from "./game-audio-manifest-service";
import type { GameProjectService } from "./game-project-service";
import type { ProjectSoundPackService } from "./project-sound-pack-service";
import type { SoundBoardExportService } from "./sound-board-export-service";
import type { SoundBoardValidationService } from "./sound-board-validation-service";
import type { SoundRequestExportService } from "./sound-request-export-service";
import { safeSoundPackFolderName, SoundPackExportService } from "./sound-pack-export-service";

interface RightsRow {
  asset_id: string;
  source_name: string;
  source_url: string;
  author: string;
  license_name: string;
  license_url: string;
  attribution_text: string;
  usage_notes: string;
  commercial_use_status: AssetRightsMetadata["commercialUseStatus"];
  credit_required: AssetRightsMetadata["creditRequired"];
  created_at: string;
  updated_at: string;
}

interface PresetRow {
  id: string;
  library_id: string;
  name: string;
  type: ExportPresetRecord["type"];
  config_json: string;
  created_at: string;
  updated_at: string;
}

interface ExportHistoryRow {
  id: string;
  library_id: string;
  created_at: string;
  status: "success" | "failure";
  target: ExportTargetType;
  source_label: string;
  output_path: string | null;
  files_json: string;
  summary_json: string;
  error_code: string | null;
  error_message: string | null;
  options_json: string;
}

interface PreparedExport {
  library: LibraryRecord;
  assets: AssetListItem[];
  contexts: ReturnType<GameAudioManifestService["createContexts"]>;
  sourceLabel: string;
  issues: ExportValidationIssue[];
  plannedFiles: ExportPreview["plannedFiles"];
}

const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  target: "codex_markdown",
  source: { type: "selected", assetIds: [] },
  includeTrashed: false,
  includeAbsolutePaths: false,
  includeCollections: true,
  includeMemo: true,
  includeRights: true,
  copyAudioFiles: true,
  groupBy: "category",
  useSafeFilenames: true,
  codexGoal: "",
  codexTemplate: "unity_import_plan",
  soundPackName: "exported-sound-pack",
  acknowledgeWarnings: false,
  engineProfile: "generic",
  filenamePolicy: "keep_original",
  approvedOnly: true,
  includeSelectedUnapproved: false,
  includeCandidates: true,
  includeRejectedCandidates: false,
  includeMissingItems: true,
  includeUsageNotes: true,
  includeBoardSummary: true,
  includeValidationReport: true,
  includeMissingReport: true,
  includeReadme: true,
  includeCredits: true,
  includeManifest: true,
  includeStyleGuide: true,
  includeChecklist: true,
  includeWorkNotes: false,
  includeReviewNotes: false,
  includeCandidateReviewNotes: false,
  includeDecisionNotes: false,
};

const PROJECT_EXPORT_TARGETS = new Set<ExportTargetType>([
  "project_sound_pack",
  "project_manifest",
  "project_missing_report",
  "project_codex_instruction",
  "sound_request_markdown",
  "sound_request_csv",
  "sound_request_json",
  "project_style_guide_markdown",
  "project_checklist_markdown",
]);

const BUILT_IN_PRESETS: ExportPresetRecord[] = [
  {
    id: "built-in-codex-unity",
    libraryId: null,
    name: "Codex Unity Import Plan",
    type: "codex_instruction",
    config: { target: "codex_markdown", codexTemplate: "unity_import_plan", includeRights: true },
    builtIn: true,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "built-in-generic-manifest",
    libraryId: null,
    name: "Generic Game Audio Manifest",
    type: "generic_manifest",
    config: { target: "generic_manifest", groupBy: "category", includeCollections: true, includeRights: true },
    builtIn: true,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "built-in-sound-pack",
    libraryId: null,
    name: "Sound Pack Folder",
    type: "sound_pack",
    config: { target: "sound_pack_folder", groupBy: "category", copyAudioFiles: true, includeRights: true },
    builtIn: true,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "built-in-project-sound-pack-unity",
    libraryId: null,
    name: "Unity Approved Project Sound Pack",
    type: "project_sound_pack",
    config: {
      target: "project_sound_pack",
      engineProfile: "unity",
      filenamePolicy: "usage_key",
      approvedOnly: true,
      includeSelectedUnapproved: false,
      includeCandidates: false,
      includeRights: true,
      includeBoardSummary: true,
      includeValidationReport: true,
      includeMissingReport: true,
      copyAudioFiles: true,
    },
    builtIn: true,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "built-in-project-manifest-unreal",
    libraryId: null,
    name: "Unreal Project Manifest",
    type: "project_manifest",
    config: {
      target: "project_manifest",
      engineProfile: "unreal",
      includeCandidates: true,
      includeMissingItems: true,
      includeRights: true,
      includeBoardSummary: true,
      includeValidationReport: true,
    },
    builtIn: true,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "built-in-project-missing-report",
    libraryId: null,
    name: "Project Missing Report",
    type: "project_missing_report",
    config: { target: "project_missing_report", includeMissingItems: true, includeBoardSummary: true },
    builtIn: true,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "built-in-project-codex-instruction",
    libraryId: null,
    name: "Codex Sound Board Instruction",
    type: "project_codex_instruction",
    config: {
      target: "project_codex_instruction",
      includeCandidates: true,
      includeMissingItems: true,
      includeUsageNotes: true,
      includeBoardSummary: true,
      includeValidationReport: true,
    },
    builtIn: true,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "built-in-sound-request-markdown",
    libraryId: null,
    name: "Sound Request Markdown",
    type: "sound_request_markdown",
    config: {
      target: "sound_request_markdown",
      includeStyleGuide: true,
      includeChecklist: true,
      includeWorkNotes: false,
      includeReviewNotes: false,
      includeCandidateReviewNotes: false,
      includeDecisionNotes: false,
    },
    builtIn: true,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "built-in-project-style-guide",
    libraryId: null,
    name: "Project Style Guide Markdown",
    type: "project_style_guide_markdown",
    config: { target: "project_style_guide_markdown", includeStyleGuide: true },
    builtIn: true,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "built-in-project-checklist",
    libraryId: null,
    name: "Project Checklist Markdown",
    type: "project_checklist_markdown",
    config: { target: "project_checklist_markdown", includeChecklist: true },
    builtIn: true,
    createdAt: "",
    updatedAt: "",
  },
];

export class ExportCenterService {
  private readonly manifestService = new GameAudioManifestService();
  private readonly codexService = new CodexInstructionExportService();
  private readonly soundPackService = new SoundPackExportService();

  constructor(
    private readonly libraryService: LibraryService,
    private readonly assetService: AssetService,
    private readonly projectSoundPackService?: ProjectSoundPackService,
    private readonly soundBoardExportService?: SoundBoardExportService,
    private readonly gameProjectService?: GameProjectService,
    private readonly soundBoardValidationService?: SoundBoardValidationService,
    private readonly soundRequestExportService?: SoundRequestExportService,
  ) {}

  async preview(input: Partial<ExportOptions>, outputDirectory?: string): Promise<ExportPreview> {
    const options = normalizeExportOptions(input);
    if (isProjectExportTarget(options.target)) {
      return this.previewProjectExport(options, outputDirectory);
    }
    if (options.source.type === "gameProject") {
      return createSourceMismatchPreview(options, "Project sources require a project export target.");
    }
    const prepared = await this.prepare(options, outputDirectory);
    return {
      ok: prepared.issues.every((issue) => issue.severity !== "error"),
      target: options.target,
      assetCount: prepared.assets.length,
      exportSourceLabel: prepared.sourceLabel,
      issues: prepared.issues,
      plannedFiles: prepared.plannedFiles,
    };
  }

  async run(input: Partial<ExportOptions>, outputDirectory: string): Promise<ExportRunResult> {
    const options = normalizeExportOptions(input);
    if (isProjectExportTarget(options.target)) {
      return this.runProjectExport(options, outputDirectory);
    }
    if (options.source.type === "gameProject") {
      return this.recordHistorySafe(
        options,
        this.createSourceLabel(options.source),
        createFailedRunResult(0, "EXPORT_TYPE_SOURCE_MISMATCH", "Project sources require a project export target."),
      );
    }
    const prepared = await this.prepare(options, outputDirectory);
    const errors = prepared.issues.filter((issue) => issue.severity === "error");
    const warnings = prepared.issues.filter((issue) => issue.severity === "warning").map((issue) => issue.message);
    if (errors.length > 0) {
      return this.recordHistorySafe(
        options,
        prepared.sourceLabel,
        createFailedRunResult(prepared.assets.length, "EXPORT_RUN_FAILED", errors[0]?.message ?? "Export failed"),
      );
    }
    if (warnings.length > 0 && !options.acknowledgeWarnings) {
      return this.recordHistorySafe(
        options,
        prepared.sourceLabel,
        createFailedRunResult(prepared.assets.length, "EXPORT_RUN_FAILED", "Warnings must be acknowledged before export."),
      );
    }

    await mkdir(outputDirectory, { recursive: true });
    const summary: ExportRunSummary = {
      requested: prepared.assets.length,
      exported: prepared.assets.length,
      skipped: 0,
      failed: 0,
      warnings,
    };

    try {
      if (options.target === "sound_pack_folder") {
        const folderName = safeSoundPackFolderName(options.soundPackName);
        const result = await this.soundPackService.exportFolder(join(outputDirectory, folderName), prepared.library, prepared.contexts, {
          includeAudioFiles: options.copyAudioFiles,
          includeAbsolutePaths: options.includeAbsolutePaths,
          includeCollections: options.includeCollections,
          includeRights: options.includeRights,
        });
        result.summary.warnings.unshift(...warnings);
        return this.recordHistorySafe(options, prepared.sourceLabel, {
          ok: result.summary.failed === 0,
          outputPath: result.outputPath,
          files: result.files,
          summary: result.summary,
        });
      }

      const { fileName, content } = this.renderTarget(prepared, options);
      const outputPath = await writeUniqueTextFile(outputDirectory, fileName, content);
      return this.recordHistorySafe(options, prepared.sourceLabel, { ok: true, outputPath, files: [outputPath], summary });
    } catch (error) {
      return this.recordHistorySafe(
        options,
        prepared.sourceLabel,
        createFailedRunResult(
          prepared.assets.length,
          "EXPORT_WRITE_FAILED",
          error instanceof Error ? error.message : String(error),
          warnings,
        ),
      );
    }
  }

  async previewCodexInstruction(input: CodexInstructionPreviewInput): Promise<string> {
    const options = normalizeExportOptions({
      target: "codex_markdown",
      source: input.source,
      codexGoal: input.goal,
      codexTemplate: input.template,
      includeAbsolutePaths: input.includeAbsolutePaths ?? false,
      includeRights: input.includeRights ?? true,
    });
    const prepared = await this.prepare(options);
    return this.codexService.createMarkdown(prepared.library, options.source, prepared.sourceLabel, prepared.contexts, {
      goal: options.codexGoal,
      template: options.codexTemplate,
      includeAbsolutePaths: options.includeAbsolutePaths,
      includeRights: options.includeRights,
    });
  }

  async previewManifest(input: ManifestPreviewInput): Promise<string> {
    const target = input.target ?? "generic_manifest";
    const options = normalizeExportOptions({
      target,
      source: input.source,
      includeAbsolutePaths: input.includeAbsolutePaths ?? false,
      includeRights: input.includeRights ?? true,
    });
    const prepared = await this.prepare(options);
    return this.renderTarget(prepared, options).content;
  }

  async getRights(assetId: string): Promise<AssetRightsMetadata> {
    const context = this.libraryService.requireActive();
    const row = context.db.get<RightsRow>("SELECT * FROM asset_rights_metadata WHERE asset_id = ?", [assetId]);
    return row ? mapRightsRow(row) : createEmptyRights(assetId);
  }

  async updateRights(assetId: string, input: AssetRightsInput): Promise<AssetRightsMetadata> {
    const context = this.libraryService.requireActive();
    const asset = await this.assetService.getAsset(assetId);
    if (!asset) {
      throw new Error("Asset not found.");
    }
    const current = await this.getRights(assetId);
    const next = normalizeRightsInput(assetId, { ...current, ...input });
    const now = new Date().toISOString();
    context.db.run(
      `
      INSERT INTO asset_rights_metadata (
        asset_id, source_name, source_url, author, license_name, license_url,
        attribution_text, usage_notes, commercial_use_status, credit_required, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(asset_id) DO UPDATE SET
        source_name = excluded.source_name,
        source_url = excluded.source_url,
        author = excluded.author,
        license_name = excluded.license_name,
        license_url = excluded.license_url,
        attribution_text = excluded.attribution_text,
        usage_notes = excluded.usage_notes,
        commercial_use_status = excluded.commercial_use_status,
        credit_required = excluded.credit_required,
        updated_at = excluded.updated_at
      `,
      [
        assetId,
        next.sourceName,
        next.sourceUrl,
        next.author,
        next.licenseName,
        next.licenseUrl,
        next.attributionText,
        next.usageNotes,
        next.commercialUseStatus,
        next.creditRequired,
        current.createdAt || now,
        now,
      ],
    );
    return this.getRights(assetId);
  }

  async batchUpdateRights(assetIds: string[], input: AssetRightsInput): Promise<BatchResult> {
    const result = createBatchResult(assetIds.length);
    for (const assetId of assetIds) {
      try {
        await this.updateRights(assetId, input);
        recordSuccess(result);
      } catch (error) {
        recordFailure(result, assetId, error instanceof Error ? error.message : String(error));
      }
    }
    return result;
  }

  listPresets(): ExportPresetRecord[] {
    const context = this.libraryService.requireActive();
    const rows = context.db.all<PresetRow>(
      "SELECT * FROM export_presets WHERE library_id = ? ORDER BY name COLLATE NOCASE",
      [context.library.id],
    );
    return [...BUILT_IN_PRESETS, ...rows.map(mapPresetRow)];
  }

  savePreset(input: ExportPresetInput): ExportPresetRecord {
    const context = this.libraryService.requireActive();
    const now = new Date().toISOString();
    const id = input.id && !input.id.startsWith("built-in-") ? input.id : randomUUID();
    context.db.run(
      `
      INSERT INTO export_presets (id, library_id, name, type, config_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        type = excluded.type,
        config_json = excluded.config_json,
        updated_at = excluded.updated_at
      `,
      [id, context.library.id, input.name.trim(), input.type, JSON.stringify(input.config), now, now],
    );
    const row = context.db.get<PresetRow>("SELECT * FROM export_presets WHERE id = ? AND library_id = ?", [
      id,
      context.library.id,
    ]);
    if (!row) {
      throw new Error("Preset was not saved.");
    }
    return mapPresetRow(row);
  }

  deletePreset(presetId: string): BatchResult {
    const context = this.libraryService.requireActive();
    const result = createBatchResult(1);
    if (presetId.startsWith("built-in-")) {
      result.skipped = 1;
      result.warnings.push("Built-in presets cannot be deleted.");
      return result;
    }
    context.db.run("DELETE FROM export_presets WHERE id = ? AND library_id = ?", [presetId, context.library.id]);
    recordSuccess(result);
    return result;
  }

  async listProjectSources(): Promise<ProjectExportSourceSummary[]> {
    if (!this.gameProjectService) {
      return [];
    }
    const projects = this.gameProjectService.listProjects(false);
    const sources: ProjectExportSourceSummary[] = [];
    for (const project of projects) {
      const summary = this.gameProjectService.getSummary(project.id);
      const validation = this.soundBoardValidationService
        ? await this.soundBoardValidationService.validateBoard(project.id)
        : null;
      sources.push({
        project,
        summary,
        validationOk: validation?.ok ?? summary.requiredMissing === 0,
        riskCount: validation?.dashboard.risks ?? summary.requiredMissing + summary.noCandidates,
      });
    }
    return sources;
  }

  listHistory(query: ExportHistoryListQuery = {}): ExportHistoryRecord[] {
    const context = this.libraryService.requireActive();
    const limit = Math.max(1, Math.min(200, query.limit ?? 30));
    const where = ["library_id = ?"];
    const params: Array<string | number> = [context.library.id];
    if (query.target) {
      where.push("target = ?");
      params.push(query.target);
    }
    if (query.projectId) {
      where.push("project_id = ?");
      params.push(query.projectId);
    }
    const rows = context.db.all<ExportHistoryRow>(
      `
      SELECT *
      FROM export_history
      WHERE ${where.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT ?
      `,
      [...params, limit],
    );
    return rows.map(mapHistoryRow);
  }

  getHistory(historyId: string): ExportHistoryRecord | null {
    const context = this.libraryService.requireActive();
    const row = context.db.get<ExportHistoryRow>("SELECT * FROM export_history WHERE id = ? AND library_id = ?", [
      historyId,
      context.library.id,
    ]);
    return row ? mapHistoryRow(row) : null;
  }

  deleteHistory(historyId: string): BatchResult {
    const context = this.libraryService.requireActive();
    const result = createBatchResult(1);
    context.db.run("DELETE FROM export_history WHERE id = ? AND library_id = ?", [historyId, context.library.id]);
    recordSuccess(result);
    return result;
  }

  private async previewProjectExport(options: ExportOptions, outputDirectory?: string): Promise<ExportPreview> {
    if (options.source.type !== "gameProject") {
      return createSourceMismatchPreview(options, "Project export targets require a game project source.");
    }
    try {
      if (options.target === "project_sound_pack") {
        const dryRun = await this.requireProjectSoundPackService().preview(toProjectSoundPackOptions(options), outputDirectory);
        return mapProjectSoundPackPreview(options, dryRun);
      }
      if (isSoundRequestTarget(options.target)) {
        const requestPreview = await this.requireSoundRequestExportService().preview(toSoundRequestExportOptions(options), outputDirectory);
        return mapSoundRequestPreview(options, requestPreview);
      }
      const boardPreview = await this.requireSoundBoardExportService().preview(toSoundBoardExportOptions(options), outputDirectory);
      return mapSoundBoardPreview(options, boardPreview);
    } catch (error) {
      return {
        ok: false,
        target: options.target,
        assetCount: 0,
        exportSourceLabel: this.createSourceLabel(options.source),
        issues: [
          {
            severity: "error",
            code: error instanceof Error && error.message === "PROJECT_NOT_FOUND" ? "PROJECT_NOT_FOUND" : "EXPORT_TYPE_SOURCE_MISMATCH",
            message: error instanceof Error ? error.message : String(error),
          },
        ],
        plannedFiles: [],
      };
    }
  }

  private async runProjectExport(options: ExportOptions, outputDirectory: string): Promise<ExportRunResult> {
    const sourceLabel = this.createSourceLabel(options.source);
    if (options.source.type !== "gameProject") {
      return this.recordHistorySafe(
        options,
        sourceLabel,
        createFailedRunResult(0, "EXPORT_TYPE_SOURCE_MISMATCH", "Project export targets require a game project source."),
      );
    }
    try {
      const result = options.target === "project_sound_pack"
        ? mapProjectSoundPackResult(await this.requireProjectSoundPackService().export(toProjectSoundPackOptions(options), outputDirectory))
        : isSoundRequestTarget(options.target)
          ? mapSoundRequestResult(await this.requireSoundRequestExportService().export(toSoundRequestExportOptions(options), outputDirectory))
          : mapSoundBoardResult(await this.requireSoundBoardExportService().run(toSoundBoardExportOptions(options), outputDirectory));
      return this.recordHistorySafe(options, sourceLabel, result);
    } catch (error) {
      return this.recordHistorySafe(
        options,
        sourceLabel,
        createFailedRunResult(0, "EXPORT_RUN_FAILED", error instanceof Error ? error.message : String(error)),
      );
    }
  }

  private requireProjectSoundPackService(): ProjectSoundPackService {
    if (!this.projectSoundPackService) {
      throw new Error("Project sound pack service is not available.");
    }
    return this.projectSoundPackService;
  }

  private requireSoundBoardExportService(): SoundBoardExportService {
    if (!this.soundBoardExportService) {
      throw new Error("Sound board export service is not available.");
    }
    return this.soundBoardExportService;
  }

  private requireSoundRequestExportService(): SoundRequestExportService {
    if (!this.soundRequestExportService) {
      throw new Error("Sound request export service is not available.");
    }
    return this.soundRequestExportService;
  }

  private recordHistorySafe(options: ExportOptions, sourceLabel: string, result: ExportRunResult): ExportRunResult {
    try {
      this.recordHistory(options, sourceLabel, result);
    } catch (error) {
      result.summary.warnings.push(`Export history could not be saved: ${error instanceof Error ? error.message : String(error)}`);
    }
    return result;
  }

  private recordHistory(options: ExportOptions, sourceLabel: string, result: ExportRunResult): void {
    const context = this.libraryService.requireActive();
    const now = new Date().toISOString();
    context.db.run(
      `
      INSERT INTO export_history (
        id, library_id, created_at, status, target, source_label, output_path,
        files_json, summary_json, error_code, error_message, options_json, project_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        randomUUID(),
        context.library.id,
        now,
        result.ok ? "success" : "failure",
        options.target,
        sourceLabel,
        result.outputPath ?? null,
        JSON.stringify(result.files),
        JSON.stringify(result.summary),
        result.error?.code ?? null,
        result.error?.message ?? null,
        JSON.stringify(options),
        options.source.type === "gameProject" ? options.source.projectId : null,
      ],
    );
  }

  private async prepare(options: ExportOptions, outputDirectory?: string): Promise<PreparedExport> {
    const context = this.libraryService.requireActive();
    const assets = await this.resolveAssets(options.source, options.includeTrashed);
    const sourceLabel = this.createSourceLabel(options.source);
    const rightsByAssetId = this.loadRightsMap(assets.map((asset) => asset.id));
    const contexts = this.manifestService.createContexts(assets, rightsByAssetId, {
      groupBy: options.groupBy,
      useSafeFilenames: options.useSafeFilenames,
    });
    const issues = await this.validate(options, contexts, outputDirectory);
    return {
      library: context.library,
      assets,
      contexts,
      sourceLabel,
      issues,
      plannedFiles: this.createPlannedFiles(options, contexts, outputDirectory),
    };
  }

  private async resolveAssets(source: ExportSource, includeTrashed: boolean): Promise<AssetListItem[]> {
    if (source.type === "selected") {
      const assets = await Promise.all(source.assetIds.map((assetId) => this.assetService.getAsset(assetId)));
      return assets.filter((asset): asset is AssetListItem => asset !== null && (includeTrashed || !asset.trashedAt));
    }
    if (source.type === "query") {
      return this.listAllAssets({ ...source.query, includeTrashed: includeTrashed || source.query.includeTrashed });
    }
    if (source.type === "collection") {
      return this.listAllAssets({ collectionIds: [source.collectionId], includeTrashed });
    }
    if (source.type === "tag") {
      return this.listAllAssets({ tagIds: [source.tagId], includeTrashed });
    }
    if (source.type === "smartFolder") {
      return this.listAllAssets({ smartFolder: source.smartFolder, includeTrashed });
    }
    return this.listAllAssets({ includeTrashed });
  }

  private async listAllAssets(query: AssetListQuery): Promise<AssetListItem[]> {
    const pageSize = 1000;
    const first = await this.assetService.listAssetPage({ ...query, page: 1, pageSize });
    const items = [...first.items];
    const pages = Math.ceil(first.total / pageSize);
    for (let page = 2; page <= pages; page += 1) {
      const next = await this.assetService.listAssetPage({ ...query, page, pageSize });
      items.push(...next.items);
    }
    return items;
  }

  private createSourceLabel(source: ExportSource): string {
    const context = this.libraryService.requireActive();
    if (source.type === "collection") {
      return (
        source.name ??
        context.db.get<{ name: string }>("SELECT name FROM collections WHERE id = ?", [source.collectionId])?.name ??
        source.collectionId
      );
    }
    if (source.type === "tag") {
      return source.name ?? context.db.get<{ name: string }>("SELECT name FROM tags WHERE id = ?", [source.tagId])?.name ?? source.tagId;
    }
    if (source.type === "smartFolder") {
      return source.name ?? source.smartFolder;
    }
    if (source.type === "query") {
      return source.label ?? "current filter";
    }
    if (source.type === "selected") {
      return `${source.assetIds.length} selected assets`;
    }
    if (source.type === "gameProject") {
      return (
        source.label ??
        source.name ??
        this.gameProjectService?.getProject(source.projectId)?.name ??
        source.projectId
      );
    }
    return "whole library";
  }

  private loadRightsMap(assetIds: string[]): Map<string, AssetRightsMetadata> {
    if (assetIds.length === 0) {
      return new Map();
    }
    const context = this.libraryService.requireActive();
    const placeholders = assetIds.map(() => "?").join(", ");
    const rows = context.db.all<RightsRow>(`SELECT * FROM asset_rights_metadata WHERE asset_id IN (${placeholders})`, assetIds);
    return new Map(rows.map((row) => [row.asset_id, mapRightsRow(row)]));
  }

  private async validate(
    options: ExportOptions,
    contexts: PreparedExport["contexts"],
    outputDirectory?: string,
  ): Promise<ExportValidationIssue[]> {
    const issues: ExportValidationIssue[] = [];
    if (contexts.length === 0) {
      issues.push({ severity: "error", code: "NO_ASSETS", message: "No assets match this export source." });
      return issues;
    }

    const baseKeys = new Map<string, string[]>();
    const baseFiles = new Map<string, string[]>();
    for (const context of contexts) {
      const sourcePath = getAssetFilePath(context.asset);
      if (!sourcePath || !(await pathExists(sourcePath))) {
        issues.push({
          severity: "error",
          code: "MISSING_FILE",
          message: `Missing file: ${context.asset.fileName}`,
          assetId: context.asset.id,
          fileName: context.asset.fileName,
        });
      }
      if (!context.asset.playable) {
        issues.push({
          severity: "warning",
          code: "PLAYBACK_UNSUPPORTED",
          message: `Playback unsupported: ${context.asset.fileName}`,
          assetId: context.asset.id,
          fileName: context.asset.fileName,
        });
      }

      const baseKey = sanitizeEngineKey(context.asset.title || context.asset.fileName);
      baseKeys.set(baseKey, [...(baseKeys.get(baseKey) ?? []), context.asset.fileName]);
      const baseFile = safeFileName(context.asset.fileName);
      baseFiles.set(baseFile, [...(baseFiles.get(baseFile) ?? []), context.asset.fileName]);

      if (options.includeRights && (!context.rights.licenseName || context.rights.commercialUseStatus === "unknown")) {
        issues.push({
          severity: "warning",
          code: "UNKNOWN_LICENSE",
          message: `Unknown license metadata: ${context.asset.fileName}`,
          assetId: context.asset.id,
          fileName: context.asset.fileName,
        });
      }
      if (options.includeRights && context.rights.creditRequired === "yes" && !context.rights.attributionText.trim()) {
        issues.push({
          severity: "warning",
          code: "CREDIT_MISSING",
          message: `Credit is required but attribution is empty: ${context.asset.fileName}`,
          assetId: context.asset.id,
          fileName: context.asset.fileName,
        });
      }
      if ((context.category === "bgm" || context.category === "ambience") && !context.loop) {
        issues.push({
          severity: "warning",
          code: "LOOP_FLAG_MISMATCH",
          message: `Long-form category is not marked as loopable: ${context.asset.fileName}`,
          assetId: context.asset.id,
          fileName: context.asset.fileName,
        });
      }
    }

    for (const [key, fileNames] of baseKeys) {
      if (fileNames.length > 1) {
        issues.push({ severity: "warning", code: "DUPLICATE_ENGINE_KEY", message: `Duplicate engine key base "${key}" will be suffixed.` });
      }
    }
    for (const [fileName, fileNames] of baseFiles) {
      if (fileNames.length > 1) {
        issues.push({ severity: "warning", code: "DUPLICATE_OUTPUT_FILE", message: `Duplicate output file "${fileName}" will be suffixed.` });
      }
    }
    if (options.includeAbsolutePaths) {
      issues.push({
        severity: "warning",
        code: "ABSOLUTE_PATH_INCLUDED",
        message: "Absolute local paths are included in this export.",
      });
    }
    if (outputDirectory) {
      const targetPath = this.createTargetPath(options, outputDirectory);
      if (await pathExists(targetPath)) {
        issues.push({
          severity: options.target === "sound_pack_folder" ? "error" : "warning",
          code: "EXPORT_TARGET_EXISTS",
          message:
            options.target === "sound_pack_folder"
              ? `Export folder already exists: ${targetPath}`
              : `Export file already exists and a suffixed file name will be used: ${targetPath}`,
        });
      }
    }
    return issues;
  }

  private createPlannedFiles(
    options: ExportOptions,
    contexts: PreparedExport["contexts"],
    outputDirectory?: string,
  ): ExportPreview["plannedFiles"] {
    const base = outputDirectory ?? "<choose-folder>";
    if (options.target === "sound_pack_folder") {
      const root = join(base, safeSoundPackFolderName(options.soundPackName));
      const files: ExportPreview["plannedFiles"] = [
        { path: join(root, "manifest.json"), kind: "manifest" },
        { path: join(root, "README.md"), kind: "markdown" },
        { path: join(root, "metadata", "assets.csv"), kind: "csv" },
      ];
      if (options.copyAudioFiles) {
        files.push(...contexts.map((context) => ({ path: join(root, "audio", context.relativePath), kind: "audio" as const, assetId: context.asset.id })));
      }
      return files;
    }
    return [{ path: join(base, fileNameForTarget(options.target)), kind: kindForTarget(options.target) }];
  }

  private createTargetPath(options: ExportOptions, outputDirectory: string): string {
    return options.target === "sound_pack_folder"
      ? join(outputDirectory, safeSoundPackFolderName(options.soundPackName))
      : join(outputDirectory, fileNameForTarget(options.target));
  }

  private renderTarget(prepared: PreparedExport, options: ExportOptions): { fileName: string; content: string } {
    switch (options.target) {
      case "codex_markdown":
        return {
          fileName: "suwol-codex-instruction.md",
          content: this.codexService.createMarkdown(prepared.library, options.source, prepared.sourceLabel, prepared.contexts, {
            goal: options.codexGoal,
            template: options.codexTemplate,
            includeAbsolutePaths: options.includeAbsolutePaths,
            includeRights: options.includeRights,
          }),
        };
      case "codex_json":
        return {
          fileName: "suwol-codex-context.json",
          content: `${JSON.stringify(
            this.codexService.createJsonContext(prepared.library, options.source, prepared.sourceLabel, prepared.contexts, {
              goal: options.codexGoal,
              template: options.codexTemplate,
              includeAbsolutePaths: options.includeAbsolutePaths,
              includeRights: options.includeRights,
            }),
            null,
            2,
          )}\n`,
        };
      case "unity_manifest":
        return jsonFile("UnityAudioManifest.json", this.manifestService.createUnityManifest(prepared.contexts));
      case "unreal_json":
        return jsonFile("UnrealAudioManifest.json", this.manifestService.createUnrealManifest(prepared.contexts));
      case "unreal_csv":
        return { fileName: "UnrealAudioManifest.csv", content: this.manifestService.createUnrealCsv(prepared.contexts) };
      case "monogame_manifest":
        return jsonFile("MonoGameAudioManifest.json", this.manifestService.createMonoGameManifest(prepared.contexts));
      case "monogame_content":
        return { fileName: "MonoGameContentList.txt", content: this.manifestService.createMonoGameContentList(prepared.contexts) };
      case "sound_pack_metadata":
        return jsonFile("sound-pack-metadata.json", this.createSoundPackMetadata(prepared, options));
      case "csv_report":
        return { fileName: "suwol-audio-report.csv", content: this.createCsvReport(prepared, options) };
      case "generic_manifest":
      default:
        return jsonFile(
          "suwol-audio-manifest.json",
          this.manifestService.createGenericManifest(prepared.library, options.source, prepared.sourceLabel, prepared.contexts, {
            includeCollections: options.includeCollections,
            includeMemo: options.includeMemo,
            includeRights: options.includeRights,
          }),
        );
    }
  }

  private createSoundPackMetadata(prepared: PreparedExport, options: ExportOptions): Record<string, unknown> {
    return {
      app: "Suwol Audio Reference",
      soundPackMetadataVersion: 1,
      createdAt: new Date().toISOString(),
      libraryName: prepared.library.name,
      exportSource: prepared.sourceLabel,
      assets: prepared.contexts.map((context) => ({
        id: context.asset.id,
        engineKey: context.engineKey,
        fileName: context.asset.fileName,
        relativePath: context.relativePath,
        category: context.category,
        tags: context.asset.tags.map((tag) => tag.name),
        collections: options.includeCollections ? context.asset.collections.map((collection) => collection.name) : undefined,
        rights: options.includeRights ? context.rights : undefined,
      })),
    };
  }

  private createCsvReport(prepared: PreparedExport, options: ExportOptions): string {
    return toCsv(
      prepared.contexts.map((context) => ({
        id: context.asset.id,
        engineKey: context.engineKey,
        fileName: context.asset.fileName,
        relativePath: context.relativePath,
        category: context.category,
        durationMs: context.asset.audioAnalysis?.durationMs ?? "",
        format: context.asset.audioAnalysis?.format ?? context.asset.fileExt,
        tags: context.asset.tags.map((tag) => tag.name).join(";"),
        collections: options.includeCollections ? context.asset.collections.map((collection) => collection.name).join(";") : "",
        rating: context.asset.rating,
        favorite: context.asset.favorite ? "true" : "false",
        licenseName: options.includeRights ? context.rights.licenseName : "",
        creditRequired: options.includeRights ? context.rights.creditRequired : "",
        sourcePath: options.includeAbsolutePaths ? getAssetFilePath(context.asset) ?? "" : "",
      })),
    );
  }
}

export function normalizeExportOptions(input: Partial<ExportOptions>): ExportOptions {
  return {
    ...DEFAULT_EXPORT_OPTIONS,
    ...input,
    source: input.source ?? DEFAULT_EXPORT_OPTIONS.source,
    codexGoal: input.codexGoal ?? "",
    soundPackName: input.soundPackName?.trim() || DEFAULT_EXPORT_OPTIONS.soundPackName,
  };
}

function normalizeRightsInput(assetId: string, input: AssetRightsInput & Partial<AssetRightsMetadata>): AssetRightsMetadata {
  const now = new Date().toISOString();
  return {
    assetId,
    sourceName: input.sourceName?.trim() ?? "",
    sourceUrl: input.sourceUrl?.trim() ?? "",
    author: input.author?.trim() ?? "",
    licenseName: input.licenseName?.trim() ?? "",
    licenseUrl: input.licenseUrl?.trim() ?? "",
    attributionText: input.attributionText?.trim() ?? "",
    usageNotes: input.usageNotes?.trim() ?? "",
    commercialUseStatus: isCommercialUseStatus(input.commercialUseStatus) ? input.commercialUseStatus : "unknown",
    creditRequired: isCreditRequiredStatus(input.creditRequired) ? input.creditRequired : "unknown",
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}

function mapRightsRow(row: RightsRow): AssetRightsMetadata {
  return {
    assetId: row.asset_id,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    author: row.author,
    licenseName: row.license_name,
    licenseUrl: row.license_url,
    attributionText: row.attribution_text,
    usageNotes: row.usage_notes,
    commercialUseStatus: row.commercial_use_status,
    creditRequired: row.credit_required,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createEmptyRights(assetId: string): AssetRightsMetadata {
  const now = new Date().toISOString();
  return {
    assetId,
    sourceName: "",
    sourceUrl: "",
    author: "",
    licenseName: "",
    licenseUrl: "",
    attributionText: "",
    usageNotes: "",
    commercialUseStatus: "unknown",
    creditRequired: "unknown",
    createdAt: now,
    updatedAt: now,
  };
}

function mapPresetRow(row: PresetRow): ExportPresetRecord {
  return {
    id: row.id,
    libraryId: row.library_id,
    name: row.name,
    type: row.type,
    config: parseJson(row.config_json) ?? {},
    builtIn: false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fileNameForTarget(target: ExportTargetType): string {
  switch (target) {
    case "codex_markdown":
      return "suwol-codex-instruction.md";
    case "codex_json":
      return "suwol-codex-context.json";
    case "unity_manifest":
      return "UnityAudioManifest.json";
    case "unreal_json":
      return "UnrealAudioManifest.json";
    case "unreal_csv":
      return "UnrealAudioManifest.csv";
    case "monogame_manifest":
      return "MonoGameAudioManifest.json";
    case "monogame_content":
      return "MonoGameContentList.txt";
    case "sound_pack_metadata":
      return "sound-pack-metadata.json";
    case "csv_report":
      return "suwol-audio-report.csv";
    case "project_sound_pack":
      return "project-sound-pack";
    case "project_manifest":
      return "project-audio-manifest.json";
    case "project_missing_report":
      return "project-missing-sounds.md";
    case "project_codex_instruction":
      return "project-codex-instruction.md";
    case "sound_request_markdown":
      return "suwol-sound-request.md";
    case "sound_request_csv":
      return "suwol-sound-request.csv";
    case "sound_request_json":
      return "suwol-sound-request.json";
    case "project_style_guide_markdown":
      return "project-style-guide.md";
    case "project_checklist_markdown":
      return "project-checklist.md";
    case "generic_manifest":
    default:
      return "suwol-audio-manifest.json";
  }
}

function kindForTarget(target: ExportTargetType): ExportPreview["plannedFiles"][number]["kind"] {
  if (
    target === "codex_markdown" ||
    target === "project_codex_instruction" ||
    target === "project_missing_report" ||
    target === "sound_request_markdown" ||
    target === "project_style_guide_markdown" ||
    target === "project_checklist_markdown"
  ) {
    return "markdown";
  }
  if (target === "unreal_csv" || target === "csv_report" || target === "sound_request_csv") {
    return "csv";
  }
  if (target === "sound_request_json") {
    return "json";
  }
  if (target === "monogame_content") {
    return "text";
  }
  return target === "sound_pack_metadata" ? "metadata" : "manifest";
}

function jsonFile(fileName: string, content: unknown): { fileName: string; content: string } {
  return { fileName, content: `${JSON.stringify(content, null, 2)}\n` };
}

async function writeUniqueTextFile(directory: string, fileName: string, content: string): Promise<string> {
  let candidate = join(directory, fileName);
  const ext = extname(fileName);
  const stem = basename(fileName, ext);
  let index = 2;
  while (await pathExists(candidate)) {
    candidate = join(directory, `${stem}-${index}${ext}`);
    index += 1;
  }
  await writeFile(candidate, content, "utf8");
  return candidate;
}

function getAssetFilePath(asset: AssetListItem): string | null {
  if (asset.fileMissing) {
    return null;
  }
  return asset.importMode === "copy" && asset.storedPath ? asset.storedPath : asset.originalPath;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function createFailedRunResult(requested: number, code: string, message: string, warnings: string[] = []): ExportRunResult {
  return {
    ok: false,
    files: [],
    summary: { requested, exported: 0, skipped: 0, failed: requested, warnings },
    error: { code, message },
  };
}

function isCommercialUseStatus(value: unknown): value is AssetRightsMetadata["commercialUseStatus"] {
  return value === "unknown" || value === "allowed" || value === "not_allowed" || value === "check_required";
}

function isCreditRequiredStatus(value: unknown): value is AssetRightsMetadata["creditRequired"] {
  return value === "unknown" || value === "yes" || value === "no";
}

function parseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function isProjectExportTarget(target: ExportTargetType): boolean {
  return PROJECT_EXPORT_TARGETS.has(target);
}

function isSoundRequestTarget(target: ExportTargetType): boolean {
  return (
    target === "sound_request_markdown" ||
    target === "sound_request_csv" ||
    target === "sound_request_json" ||
    target === "project_style_guide_markdown" ||
    target === "project_checklist_markdown"
  );
}

function createSourceMismatchPreview(options: ExportOptions, message: string): ExportPreview {
  return {
    ok: false,
    target: options.target,
    assetCount: 0,
    exportSourceLabel: options.source.type === "gameProject" ? options.source.name ?? options.source.projectId : "unsupported source",
    issues: [{ severity: "error", code: "EXPORT_TYPE_SOURCE_MISMATCH", message }],
    plannedFiles: [],
  };
}

function toProjectSoundPackOptions(options: ExportOptions): ProjectSoundPackOptions {
  const source = options.source.type === "gameProject" ? options.source : null;
  return {
    projectId: source?.projectId ?? "",
    usageItemIds: source?.usageItemIds,
    engineProfile: options.engineProfile,
    soundPackName: options.soundPackName,
    approvedOnly: options.approvedOnly,
    includeSelectedUnapproved: options.includeSelectedUnapproved,
    includeCandidates: options.includeCandidates,
    includeRejectedCandidates: options.includeRejectedCandidates,
    includeMissingReport: options.includeMissingReport,
    includeValidationReport: options.includeValidationReport,
    includeRights: options.includeRights,
    includeBoardSummary: options.includeBoardSummary,
    includeReadme: options.includeReadme,
    includeCredits: options.includeCredits,
    includeManifest: options.includeManifest,
    includeStyleGuide: options.includeStyleGuide,
    includeChecklist: options.includeChecklist,
    includeWorkNotes: options.includeWorkNotes,
    includeReviewNotes: options.includeReviewNotes,
    includeCandidateReviewNotes: options.includeCandidateReviewNotes,
    includeDecisionNotes: options.includeDecisionNotes,
    copyAudioFiles: options.copyAudioFiles,
    filenamePolicy: options.filenamePolicy,
    acknowledgeWarnings: options.acknowledgeWarnings,
  };
}

function toSoundBoardExportOptions(options: ExportOptions): SoundBoardExportOptions {
  const source = options.source.type === "gameProject" ? options.source : null;
  return {
    projectId: source?.projectId ?? "",
    format: formatForProjectTarget(options),
    usageItemIds: source?.usageItemIds,
    includeCandidates: options.includeCandidates,
    includeRejectedCandidates: options.includeRejectedCandidates,
    includeMissingItems: options.includeMissingItems,
    includeUsageNotes: options.includeUsageNotes,
    includeRights: options.includeRights,
    includeAbsolutePaths: options.includeAbsolutePaths,
    includeBoardSummary: options.includeBoardSummary,
    includeValidationReport: options.includeValidationReport,
    includeStyleGuide: options.includeStyleGuide,
    includeChecklist: options.includeChecklist,
    includeWorkNotes: options.includeWorkNotes,
    includeReviewNotes: options.includeReviewNotes,
    includeCandidateReviewNotes: options.includeCandidateReviewNotes,
    includeDecisionNotes: options.includeDecisionNotes,
    selectedOnly: Boolean(source?.usageItemIds?.length),
    copySelectedAudioFiles: false,
    copyCandidates: false,
  };
}

function toSoundRequestExportOptions(options: ExportOptions): SoundRequestExportOptions {
  const source = options.source.type === "gameProject" ? options.source : null;
  return {
    projectId: source?.projectId ?? "",
    format: soundRequestFormatForTarget(options.target),
    documentType: soundRequestDocumentForTarget(options.target),
    usageItemIds: source?.usageItemIds,
    includeMissingItems: options.includeMissingItems,
    includeCandidates: options.includeCandidates,
    includeRejectedCandidates: options.includeRejectedCandidates,
    includeStyleGuide: options.includeStyleGuide,
    includeChecklist: options.includeChecklist,
    includeWorkNotes: options.includeWorkNotes,
    includeReviewNotes: options.includeReviewNotes,
    includeCandidateReviewNotes: options.includeCandidateReviewNotes,
    includeDecisionNotes: options.includeDecisionNotes,
    includeAbsolutePaths: options.includeAbsolutePaths,
    includeRights: options.includeRights,
  };
}

function formatForProjectTarget(options: ExportOptions): SoundBoardExportOptions["format"] {
  if (options.target === "project_missing_report") {
    return "missing_report";
  }
  if (options.target === "project_codex_instruction") {
    return "codex_instruction";
  }
  if (options.engineProfile === "unity") {
    return "unity_manifest";
  }
  if (options.engineProfile === "unreal") {
    return "unreal_manifest";
  }
  if (options.engineProfile === "monogame") {
    return "monogame_manifest";
  }
  return "generic_manifest";
}

function soundRequestFormatForTarget(target: ExportTargetType): SoundRequestExportOptions["format"] {
  if (target === "sound_request_csv") {
    return "csv";
  }
  if (target === "sound_request_json") {
    return "json";
  }
  return "markdown";
}

function soundRequestDocumentForTarget(target: ExportTargetType): SoundRequestExportOptions["documentType"] {
  if (target === "project_style_guide_markdown") {
    return "style_guide";
  }
  if (target === "project_checklist_markdown") {
    return "checklist";
  }
  return "request";
}

function mapProjectSoundPackPreview(options: ExportOptions, dryRun: ProjectSoundPackDryRun): ExportPreview {
  return {
    ok: dryRun.errors.length === 0,
    target: options.target,
    assetCount: dryRun.summary.includedUsageItems,
    exportSourceLabel: dryRun.projectName,
    issues: [...dryRun.errors, ...dryRun.warnings].map((issue) => ({
      severity: issue.severity,
      code: mapProjectSoundPackIssueCode(issue.code),
      message: issue.message,
      assetId: issue.assetId,
      fileName: issue.fileName,
    })),
    plannedFiles: dryRun.plannedFiles.map((file) => ({
      path: join(dryRun.outputRoot, file.relativePath),
      kind: kindForProjectSoundPackFile(file.type),
      assetId: file.assetId,
    })),
  };
}

function mapSoundBoardPreview(options: ExportOptions, preview: SoundBoardExportPreview): ExportPreview {
  const issues: ExportValidationIssue[] = [
    ...(preview.validationIssues?.map((issue): ExportValidationIssue => ({
      severity: issue.severity,
      code: mapSoundBoardIssueCode(issue.code),
      message: issue.message,
      assetId: issue.assetId,
    })) ?? []),
    ...preview.warnings.map((message): ExportValidationIssue => ({
      severity: "warning",
      code: "PROJECT_SOUND_PACK_VALIDATION_BLOCKED",
      message,
    })),
  ];
  return {
    ok: preview.ok && issues.every((issue) => issue.severity !== "error"),
    target: options.target,
    assetCount: preview.itemCount,
    exportSourceLabel: options.source.type === "gameProject" ? options.source.name ?? preview.projectId : preview.projectId,
    issues,
    plannedFiles: preview.plannedFiles.map((file): PlannedExportFile => ({
      path: file.path,
      kind: file.kind === "report" ? "report" : file.kind,
    })),
  };
}

function mapSoundRequestPreview(options: ExportOptions, preview: SoundRequestExportPreview): ExportPreview {
  const issues: ExportValidationIssue[] = [
    ...(preview.validationIssues?.map((issue): ExportValidationIssue => ({
      severity: issue.severity,
      code: mapSoundBoardIssueCode(issue.code),
      message: issue.message,
      assetId: issue.assetId,
    })) ?? []),
    ...preview.warnings.map((message): ExportValidationIssue => ({
      severity: "warning",
      code: "PROJECT_SOUND_PACK_VALIDATION_BLOCKED",
      message,
    })),
  ];
  return {
    ok: preview.ok && issues.every((issue) => issue.severity !== "error"),
    target: options.target,
    assetCount: preview.itemCount,
    exportSourceLabel: options.source.type === "gameProject" ? options.source.name ?? preview.projectId : preview.projectId,
    issues,
    plannedFiles: preview.plannedFiles.map((file): PlannedExportFile => ({
      path: file.path,
      kind: file.kind,
    })),
  };
}

function mapProjectSoundPackResult(result: ProjectSoundPackExportResult): ExportRunResult {
  return {
    ok: result.ok,
    outputPath: result.outputPath,
    files: result.files,
    summary: {
      requested: result.summary.requestedUsageItems,
      exported: result.ok ? result.files.length : 0,
      skipped: result.summary.skippedMissingFiles + result.summary.skippedRejectedCandidates,
      failed: result.ok ? 0 : result.summary.requestedUsageItems,
      warnings: result.warnings.map((issue) => issue.message),
    },
    error: result.error,
  };
}

function mapSoundRequestResult(result: SoundRequestExportResult): ExportRunResult {
  return {
    ok: result.ok,
    outputPath: result.outputPath,
    files: result.files,
    summary: {
      requested: result.summary.requested,
      exported: result.summary.success,
      skipped: result.summary.skipped,
      failed: result.summary.failed,
      warnings: result.summary.warnings,
    },
    error: result.error,
  };
}

function mapSoundBoardResult(result: SoundBoardExportResult): ExportRunResult {
  return {
    ok: result.ok,
    outputPath: result.outputPath,
    files: result.files,
    summary: {
      requested: result.summary.requested,
      exported: result.summary.success,
      skipped: result.summary.skipped,
      failed: result.summary.failed,
      warnings: result.summary.warnings,
    },
    error: result.error,
  };
}

function kindForProjectSoundPackFile(type: ProjectSoundPackDryRun["plannedFiles"][number]["type"]): PlannedExportFile["kind"] {
  if (type === "audio") {
    return "audio";
  }
  if (type === "doc") {
    return "markdown";
  }
  if (type === "metadata") {
    return "metadata";
  }
  return "manifest";
}

function mapProjectSoundPackIssueCode(code: string): ExportValidationIssue["code"] {
  if (code === "PROJECT_SOUND_PACK_MISSING_FILE") {
    return "MISSING_FILE";
  }
  if (code === "PROJECT_SOUND_PACK_DUPLICATE_OUTPUT") {
    return "DUPLICATE_OUTPUT_FILE";
  }
  if (code === "PROJECT_SOUND_PACK_OUTPUT_EXISTS") {
    return "EXPORT_TARGET_EXISTS";
  }
  if (code === "PROJECT_SOUND_PACK_NO_SELECTED_ASSETS") {
    return "NO_ASSETS";
  }
  if (code === "UNKNOWN_LICENSE") {
    return "UNKNOWN_LICENSE";
  }
  if (code === "CREDIT_MISSING") {
    return "CREDIT_MISSING";
  }
  if (code === "LOOP_MISMATCH") {
    return "LOOP_FLAG_MISMATCH";
  }
  if (code === "PLAYBACK_UNSUPPORTED") {
    return "PLAYBACK_UNSUPPORTED";
  }
  return "PROJECT_SOUND_PACK_VALIDATION_BLOCKED";
}

function mapSoundBoardIssueCode(code: string): ExportValidationIssue["code"] {
  if (code === "SELECTED_MISSING_FILE") {
    return "MISSING_FILE";
  }
  if (code === "UNKNOWN_LICENSE") {
    return "UNKNOWN_LICENSE";
  }
  if (code === "CREDIT_MISSING") {
    return "CREDIT_MISSING";
  }
  if (code === "LOOP_MISMATCH") {
    return "LOOP_FLAG_MISMATCH";
  }
  if (code === "SELECTED_PLAYBACK_UNSUPPORTED") {
    return "PLAYBACK_UNSUPPORTED";
  }
  if (code === "DUPLICATE_KEY" || code === "ENGINE_KEY_WARNING") {
    return "DUPLICATE_ENGINE_KEY";
  }
  return "PROJECT_SOUND_PACK_VALIDATION_BLOCKED";
}

function mapHistoryRow(row: ExportHistoryRow): ExportHistoryRecord {
  return {
    id: row.id,
    libraryId: row.library_id,
    createdAt: row.created_at,
    status: row.status,
    target: row.target,
    sourceLabel: row.source_label,
    outputPath: row.output_path,
    files: parseJson<string[]>(row.files_json) ?? [],
    summary: parseJson<ExportRunSummary>(row.summary_json) ?? {
      requested: 0,
      exported: 0,
      skipped: 0,
      failed: 0,
      warnings: [],
    },
    errorCode: row.error_code,
    errorMessage: row.error_message,
    options: parseJson<Partial<ExportOptions>>(row.options_json) ?? {},
  };
}
