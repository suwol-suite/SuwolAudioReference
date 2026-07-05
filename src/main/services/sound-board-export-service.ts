import { access, mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import type { AssetListItem, BatchResult } from "../../shared/library-types";
import type {
  GameProjectRecord,
  SoundBoardExportOptions,
  SoundBoardExportPreview,
  SoundBoardExportResult,
  SoundBoardValidationResult,
  SoundUsageCandidateRecord,
  SoundUsageItemRecord,
} from "../../shared/sound-board-types";
import { APP_NAME } from "../../shared/app-metadata";
import type { AssetService } from "./asset-service";
import { createBatchResult } from "./batch-result";
import { GameProjectService } from "./game-project-service";
import { safeFileName, sanitizeEngineKey, toCsv } from "./game-audio-manifest-service";
import type { LibraryService } from "./library-service";
import { SoundBoardValidationService } from "./sound-board-validation-service";
import { SoundCandidateService } from "./sound-candidate-service";
import { coerceSoundBoardExportFormat } from "./sound-board-helpers";
import { SoundChecklistService } from "./sound-checklist-service";
import { SoundStyleGuideService } from "./sound-style-guide-service";
import { SoundUsageService } from "./sound-usage-service";

interface BoardContext {
  project: GameProjectRecord;
  items: SoundUsageItemRecord[];
  candidatesByItemId: Map<string, SoundUsageCandidateRecord[]>;
  selectedByItemId: Map<string, SoundUsageCandidateRecord[]>;
  validation: SoundBoardValidationResult;
  warnings: string[];
  styleGuideMarkdown: string;
  checklistMarkdown: string;
}

export class SoundBoardExportService {
  private readonly projectService: GameProjectService;
  private readonly usageService: SoundUsageService;
  private readonly validationService: SoundBoardValidationService;
  private readonly styleGuideService: SoundStyleGuideService;
  private readonly checklistService: SoundChecklistService;

  constructor(
    private readonly libraryService: LibraryService,
    private readonly assetService: AssetService,
    private readonly candidateService: SoundCandidateService,
  ) {
    this.projectService = new GameProjectService(libraryService);
    this.usageService = new SoundUsageService(libraryService, assetService);
    this.validationService = new SoundBoardValidationService(libraryService, assetService, candidateService);
    this.styleGuideService = new SoundStyleGuideService(libraryService);
    this.checklistService = new SoundChecklistService(libraryService);
  }

  async preview(input: SoundBoardExportOptions, outputDirectory?: string): Promise<SoundBoardExportPreview> {
    const options = normalizeProjectExportOptions(input);
    const context = await this.buildContext(options);
    const content = await this.render(context, options);
    return {
      ok: context.warnings.length === 0 || options.format === "missing_report",
      projectId: options.projectId,
      format: options.format,
      itemCount: context.items.length,
      selectedCount: Array.from(context.selectedByItemId.values()).reduce((sum, candidates) => sum + candidates.length, 0),
      candidateCount: Array.from(context.candidatesByItemId.values()).reduce((sum, candidates) => sum + candidates.length, 0),
      missingCount: context.items.filter((item) => item.status === "missing" || item.selectedCandidateCount === 0).length,
      requiredMissingCount: context.validation.dashboard.missing,
      warningCount: context.validation.issues.filter((issue) => issue.severity === "warning").length,
      errorCount: context.validation.issues.filter((issue) => issue.severity === "error").length,
      unknownLicenseCount: context.validation.dashboard.unknownLicenseSelected,
      engineKeyWarningCount: context.validation.issues.filter((issue) => issue.code === "ENGINE_KEY_WARNING").length,
      copiedFileCount: estimateCopiedFiles(context, options),
      skippedFileCount: estimateSkippedFiles(context),
      plannedFiles: [{ path: join(outputDirectory ?? "<choose-folder>", fileNameForProjectExport(options.format)), kind: kindForFormat(options.format) }],
      warnings: context.warnings,
      validationIssues: context.validation.issues,
      previewText: content.length > 12000 ? `${content.slice(0, 12000)}\n...` : content,
    };
  }

  async run(input: SoundBoardExportOptions, outputDirectory: string): Promise<SoundBoardExportResult> {
    const options = normalizeProjectExportOptions(input);
    const context = await this.buildContext(options);
    const summary = createBatchResult(context.items.length);
    try {
      await mkdir(outputDirectory, { recursive: true });
      const content = await this.render(context, options);
      const outputPath = await writeUniqueTextFile(outputDirectory, fileNameForProjectExport(options.format), content);
      summary.success = context.items.length;
      summary.warnings.push(...context.warnings);
      return { ok: true, outputPath, files: [outputPath], summary };
    } catch (error) {
      return {
        ok: false,
        files: [],
        summary: failAll(summary, error instanceof Error ? error.message : String(error)),
        error: {
          code: "SOUND_BOARD_EXPORT_FAILED",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  private async buildContext(options: Required<SoundBoardExportOptions>): Promise<BoardContext> {
    const project = this.projectService.getProject(options.projectId);
    if (!project) {
      throw new Error("PROJECT_NOT_FOUND");
    }
    const allItems = await this.usageService.listItems({ projectId: options.projectId });
    const itemIdSet = options.usageItemIds.length > 0 ? new Set(options.usageItemIds) : null;
    const scopedItems = itemIdSet ? allItems.filter((item) => itemIdSet.has(item.id)) : allItems;
    const items = options.includeMissingItems
      ? scopedItems
      : scopedItems.filter((item) => item.selectedCandidateCount > 0 || item.candidateCount > 0);
    const candidatesByItemId = new Map<string, SoundUsageCandidateRecord[]>();
    const selectedByItemId = new Map<string, SoundUsageCandidateRecord[]>();
    const warnings: string[] = [];
    for (const item of items) {
      const candidates = (await this.candidateService.listCandidates(item.id)).filter(
        (candidate) => options.includeRejectedCandidates || !candidate.rejected,
      );
      candidatesByItemId.set(item.id, options.includeCandidates ? candidates : candidates.filter((candidate) => candidate.selected));
      const selected = candidates.filter((candidate) => candidate.selected);
      selectedByItemId.set(item.id, selected);
      if (item.required && selected.length === 0) {
        warnings.push(`Missing required sound: ${item.key}`);
      }
      for (const candidate of selected) {
        if (!candidate.asset || candidate.asset.fileMissing) {
          warnings.push(`Selected asset is missing: ${item.key}`);
        }
      }
    }
    const validation = await this.validationService.validateBoard(options.projectId);
    warnings.push(...validation.issues.filter((issue) => issue.severity === "warning").map((issue) => issue.message));
    return {
      project,
      items,
      candidatesByItemId,
      selectedByItemId,
      validation,
      warnings: Array.from(new Set(warnings)),
      styleGuideMarkdown: options.includeStyleGuide ? this.styleGuideService.createMarkdown(project.id) : "",
      checklistMarkdown: options.includeChecklist ? this.checklistService.createMarkdown(project.id) : "",
    };
  }

  private async render(context: BoardContext, options: Required<SoundBoardExportOptions>): Promise<string> {
    switch (options.format) {
      case "unity_manifest":
        return jsonText(createUnityManifest(context, options));
      case "unreal_manifest":
        return createUnrealCsv(context, options);
      case "monogame_manifest":
        return createMonoGameContent(context, options);
      case "codex_instruction":
        return createCodexInstruction(context, options);
      case "sound_pack":
        return jsonText(createSoundPackPlan(context, options));
      case "missing_report":
        return options.usageItemIds.length > 0
          ? createContextMissingReportMarkdown(context)
          : createMissingReportMarkdown(await this.usageService.getMissingReport(context.project.id));
      case "generic_manifest":
      default:
        return jsonText(createGenericManifest(context, options));
    }
  }
}

export function normalizeProjectExportOptions(input: SoundBoardExportOptions): Required<SoundBoardExportOptions> {
  return {
    projectId: input.projectId,
    format: coerceSoundBoardExportFormat(input.format),
    usageItemIds: input.usageItemIds ?? [],
    includeCandidates: input.includeCandidates ?? true,
    includeRejectedCandidates: input.includeRejectedCandidates ?? false,
    includeMissingItems: input.includeMissingItems ?? true,
    includeUsageNotes: input.includeUsageNotes ?? true,
    includeRights: input.includeRights ?? true,
    includeAbsolutePaths: input.includeAbsolutePaths ?? false,
    includeBoardSummary: input.includeBoardSummary ?? true,
    includeValidationReport: input.includeValidationReport ?? true,
    includeStyleGuide: input.includeStyleGuide ?? true,
    includeChecklist: input.includeChecklist ?? true,
    includeWorkNotes: input.includeWorkNotes ?? false,
    includeReviewNotes: input.includeReviewNotes ?? false,
    includeCandidateReviewNotes: input.includeCandidateReviewNotes ?? false,
    includeDecisionNotes: input.includeDecisionNotes ?? false,
    selectedOnly: input.selectedOnly ?? false,
    copySelectedAudioFiles: input.copySelectedAudioFiles ?? false,
    copyCandidates: input.copyCandidates ?? false,
  };
}

function createGenericManifest(context: BoardContext, options: Required<SoundBoardExportOptions>): Record<string, unknown> {
  return {
    app: APP_NAME,
    manifestVersion: 1,
    createdAt: new Date().toISOString(),
    project: createProjectJson(context.project),
    summary: {
      usageItems: context.items.length,
      selectedAssets: Array.from(context.selectedByItemId.values()).reduce((sum, candidates) => sum + candidates.length, 0),
      warnings: context.warnings,
    },
    boardSummary: options.includeBoardSummary ? context.validation.dashboard : undefined,
    validation: options.includeValidationReport ? context.validation.issues : undefined,
    usages: context.items.map((item) => createUsageJson(item, context.candidatesByItemId.get(item.id) ?? [], options)),
  };
}

function createUnityManifest(context: BoardContext, options: Required<SoundBoardExportOptions>): Record<string, unknown> {
  return {
    engine: "unity",
    version: 1,
    project: createProjectJson(context.project),
    audioClips: context.items.flatMap((item) =>
      (context.selectedByItemId.get(item.id) ?? []).map((candidate) => ({
        usageKey: item.key,
        key: sanitizeEngineKey(item.key),
        displayName: item.displayName,
        path: `Assets/Audio/${safePathSegment(item.category)}/${safeFileName(candidate.asset?.fileName ?? `${item.key}.wav`)}`,
        category: item.category,
        status: item.status,
        priority: item.priority,
        required: item.required,
        loop: item.loopRequired,
        asset: createAssetRef(candidate.asset, options),
      })),
    ),
    missingUsageKeys: context.items
      .filter((item) => item.required && (context.selectedByItemId.get(item.id) ?? []).length === 0)
      .map((item) => item.key),
  };
}

function createUnrealCsv(context: BoardContext, options: Required<SoundBoardExportOptions>): string {
  return toCsv(
    context.items.flatMap((item) => {
      const selected = context.selectedByItemId.get(item.id) ?? [];
      if (selected.length === 0) {
        return [
          {
            UsageKey: item.key,
            DisplayName: item.displayName,
            Category: item.category,
            Status: item.status,
            Priority: item.priority,
            Required: item.required ? "true" : "false",
            LoopRequired: item.loopRequired ? "true" : "false",
            AssetId: "",
            FileName: "",
            RelativePath: "",
            Notes: options.includeUsageNotes ? item.notes : "",
          },
        ];
      }
      return selected.map((candidate) => ({
        UsageKey: item.key,
        DisplayName: item.displayName,
        Category: item.category,
        Status: item.status,
        Priority: item.priority,
        Required: item.required ? "true" : "false",
        LoopRequired: item.loopRequired ? "true" : "false",
        AssetId: candidate.assetId,
        FileName: candidate.asset?.fileName ?? "",
        RelativePath: `Audio/${safePathSegment(item.category)}/${safeFileName(candidate.asset?.fileName ?? `${item.key}.wav`)}`,
        Notes: options.includeUsageNotes ? item.notes : "",
      }));
    }),
  );
}

function createMonoGameContent(context: BoardContext, options: Required<SoundBoardExportOptions>): string {
  const lines = [
    `# ${APP_NAME} MonoGame sound usage manifest`,
    `# Project: ${context.project.name}`,
    `# Generated: ${new Date().toISOString()}`,
    "",
  ];
  for (const item of context.items) {
    const selected = context.selectedByItemId.get(item.id) ?? [];
    if (selected.length === 0) {
      lines.push(`# missing usageKey: ${item.key}`, "");
      continue;
    }
    for (const candidate of selected) {
      const fileName = safeFileName(candidate.asset?.fileName ?? `${item.key}.wav`);
      const path = `Audio/${safePathSegment(item.category)}/${fileName}`;
      lines.push(
        `# usageKey: ${item.key}`,
        `# displayName: ${item.displayName}`,
        options.includeUsageNotes && item.notes ? `# notes: ${item.notes}` : "# notes:",
        `# assetId: ${candidate.assetId}`,
        `#begin ${path}`,
        `/importer:${inferMonoGameImporter(fileName)}`,
        `/processor:SoundEffectProcessor`,
        `/build:${path}`,
        "",
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

function createCodexInstruction(context: BoardContext, options: Required<SoundBoardExportOptions>): string {
  const lines = [
    "# Suwol Audio Reference Sound Usage Plan",
    "",
    "## Goal",
    "",
    "Use this local sound usage board to plan game-audio implementation. Do not modify original audio files or infer missing license metadata.",
    "",
    "## Project",
    "",
    `* Name: ${escapeMarkdown(context.project.name)}`,
    `* Engine: ${context.project.engineType}`,
    `* Namespace: ${context.project.rootNamespace || "TODO"}`,
    `* Generated: ${new Date().toISOString()}`,
    `* Total usage items: ${context.validation.dashboard.total}`,
    `* Missing required: ${context.validation.dashboard.missing}`,
    `* Risks: ${context.validation.dashboard.risks}`,
    "",
    "## Sound Usage Board",
    "",
  ];
  for (const item of context.items) {
    const selected = context.selectedByItemId.get(item.id) ?? [];
    const candidates = context.candidatesByItemId.get(item.id) ?? [];
    lines.push(
      `### ${escapeMarkdown(item.key)} - ${escapeMarkdown(item.displayName)}`,
      "",
      `* category: ${item.category}`,
      `* status: ${item.status}`,
      `* priority: ${item.priority}`,
      `* required: ${item.required ? "yes" : "no"}`,
      `* loopRequired: ${item.loopRequired ? "yes" : "no"}`,
      `* selected: ${selected.map((candidate) => candidate.asset?.fileName ?? candidate.assetId).join(", ") || "TODO"}`,
      `* candidates: ${candidates.length}`,
      ...(options.includeUsageNotes ? [`* notes: ${item.notes || item.description || "none"}`] : []),
      ...(options.includeWorkNotes && item.workNote ? [`* workNote: ${item.workNote}`] : []),
      ...(options.includeReviewNotes && item.reviewNote ? [`* reviewNote: ${item.reviewNote}`] : []),
      ...(options.includeDecisionNotes && item.decisionNote ? [`* decisionNote: ${item.decisionNote}`] : []),
      "",
    );
    if (options.includeCandidateReviewNotes) {
      for (const candidate of candidates.filter((entry) => entry.pros || entry.cons || entry.reviewNote || entry.ratingForUsage !== null)) {
        lines.push(
          `* candidateReview: ${candidate.asset?.fileName ?? candidate.assetId}`,
          `  * ratingForUsage: ${candidate.ratingForUsage ?? "TODO"}`,
          candidate.pros ? `  * pros: ${candidate.pros}` : "",
          candidate.cons ? `  * cons: ${candidate.cons}` : "",
          candidate.reviewNote ? `  * review: ${candidate.reviewNote}` : "",
        );
      }
      if (candidates.some((entry) => entry.pros || entry.cons || entry.reviewNote || entry.ratingForUsage !== null)) {
        lines.push("");
      }
    }
  }
  if (options.includeStyleGuide && context.styleGuideMarkdown.trim()) {
    lines.push("## Project Sound Style Guide", "", context.styleGuideMarkdown.trim(), "");
  }
  if (options.includeChecklist && context.checklistMarkdown.trim()) {
    lines.push("## Project Checklist", "", context.checklistMarkdown.trim(), "");
  }
  lines.push("## Missing Required Sounds", "");
  const missing = context.items.filter((item) => item.required && (context.selectedByItemId.get(item.id) ?? []).length === 0);
  lines.push(...(missing.length ? missing.map((item) => `* ${item.key} - ${item.displayName}`) : ["* none"]));
  lines.push("", "## Risk List", "");
  const risks = context.validation.issues.filter((issue) => issue.severity !== "info");
  lines.push(...(risks.length ? risks.map((issue) => `* [${issue.severity}] ${issue.usageKey ?? "board"}: ${issue.message}`) : ["* none"]));
  lines.push("", "## Requested Output", "", "Create an implementation-ready sound usage map, missing-sound TODO list, and non-destructive import plan.");
  return `${lines.join("\n")}\n`;
}

function createSoundPackPlan(context: BoardContext, options: Required<SoundBoardExportOptions>): Record<string, unknown> {
  return {
    app: APP_NAME,
    soundPackPlanVersion: 1,
    createdAt: new Date().toISOString(),
    project: createProjectJson(context.project),
    includesAudioFiles: false,
    usages: context.items.map((item) => createUsageJson(item, context.candidatesByItemId.get(item.id) ?? [], options)),
  };
}

function createUsageJson(
  item: SoundUsageItemRecord,
  candidates: SoundUsageCandidateRecord[],
  options: Required<SoundBoardExportOptions>,
): Record<string, unknown> {
  const selected = candidates.filter((candidate) => candidate.selected);
  return {
    usageKey: item.key,
    displayName: item.displayName,
    category: item.category,
    description: item.description,
    required: item.required,
    status: item.status,
    priority: item.priority,
    loopRequired: item.loopRequired,
    variantsAllowed: item.variantsAllowed,
    targetDurationMs: item.targetDurationMs,
    targetLoudnessNote: item.targetLoudnessNote,
    notes: options.includeUsageNotes ? item.notes : undefined,
    workNote: options.includeWorkNotes ? item.workNote : undefined,
    assignee: item.assignee,
    dueLabel: item.dueLabel,
    reviewNote: options.includeReviewNotes ? item.reviewNote : undefined,
    decisionNote: options.includeDecisionNotes ? item.decisionNote : undefined,
    selectedAssets: selected.map((candidate) => createCandidateJson(candidate, options)),
    candidates: options.includeCandidates ? candidates.map((candidate) => createCandidateJson(candidate, options)) : undefined,
  };
}

function createCandidateJson(candidate: SoundUsageCandidateRecord, options: Required<SoundBoardExportOptions>): Record<string, unknown> {
  return {
    candidateId: candidate.id,
    assetId: candidate.assetId,
    rank: candidate.candidateRank,
    fitScore: candidate.fitScore,
    selected: candidate.selected,
    approved: candidate.approved,
    rejected: candidate.rejected,
    userNote: candidate.userNote,
    review: options.includeCandidateReviewNotes
      ? {
          pros: candidate.pros,
          cons: candidate.cons,
          reviewNote: candidate.reviewNote,
          decisionReason: options.includeDecisionNotes ? candidate.decisionReason : undefined,
          ratingForUsage: candidate.ratingForUsage,
          loudnessFit: candidate.loudnessFit,
          loopFit: candidate.loopFit,
          moodFit: candidate.moodFit,
        }
      : undefined,
    fitReasons: candidate.fitReasons,
    asset: createAssetRef(candidate.asset, options),
  };
}

function createAssetRef(asset: AssetListItem | null, options: Required<SoundBoardExportOptions>): Record<string, unknown> | null {
  if (!asset) {
    return null;
  }
  return {
    id: asset.id,
    fileName: asset.fileName,
    title: asset.title,
    durationMs: asset.audioAnalysis?.durationMs ?? null,
    format: asset.audioAnalysis?.format ?? asset.fileExt,
    tags: asset.tags.map((tag) => tag.name),
    rating: asset.rating,
    favorite: asset.favorite,
    playable: asset.playable,
    fileMissing: asset.fileMissing,
    sourcePath: options.includeAbsolutePaths ? getAssetFilePath(asset) : undefined,
  };
}

function createProjectJson(project: GameProjectRecord): Record<string, unknown> {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    engineType: project.engineType,
    rootNamespace: project.rootNamespace,
    defaultExportFormat: project.defaultExportFormat,
  };
}

function createMissingReportMarkdown(report: Awaited<ReturnType<SoundUsageService["getMissingReport"]>>): string {
  const lines = [
    "# Suwol Audio Reference Missing Sound Report",
    "",
    `* Project: ${escapeMarkdown(report.project.name)}`,
    `* Generated: ${new Date().toISOString()}`,
    `* Items: ${report.summary.total}`,
    `* Required missing: ${report.summary.requiredMissing}`,
    `* No candidates: ${report.summary.noCandidates}`,
    "",
    "## Required Missing",
    "",
    ...listItems(report.requiredMissing),
    "",
    "## Candidate Gaps",
    "",
    ...listItems(report.candidatesWithoutSelected),
    "",
    "## Loop Warnings",
    "",
    ...listItems(report.loopWarnings),
    "",
    "## Unknown License On Selected Assets",
    "",
    ...(report.unknownLicenseSelected.length
      ? report.unknownLicenseSelected.map((candidate) => `* ${candidate.asset?.fileName ?? candidate.assetId}`)
      : ["* none"]),
  ];
  return `${lines.join("\n")}\n`;
}

function createContextMissingReportMarkdown(context: BoardContext): string {
  const requiredMissing = context.items.filter((item) => item.required && (context.selectedByItemId.get(item.id) ?? []).length === 0);
  const candidateGaps = context.items.filter((item) => (context.candidatesByItemId.get(item.id) ?? []).length === 0);
  const selectedGaps = context.items.filter((item) => (context.candidatesByItemId.get(item.id) ?? []).length > 0 && (context.selectedByItemId.get(item.id) ?? []).length === 0);
  const loopWarnings = context.validation.issues.filter((issue) => issue.code === "LOOP_MISMATCH");
  const licenseWarnings = context.validation.issues.filter((issue) => issue.code === "UNKNOWN_LICENSE");
  const lines = [
    "# Suwol Audio Reference Missing Sound Report",
    "",
    `* Project: ${escapeMarkdown(context.project.name)}`,
    `* Generated: ${new Date().toISOString()}`,
    `* Items: ${context.items.length}`,
    `* Required missing: ${requiredMissing.length}`,
    `* No candidates: ${candidateGaps.length}`,
    "",
    "## Required Missing",
    "",
    ...listItems(requiredMissing),
    "",
    "## Candidate Gaps",
    "",
    ...listItems([...candidateGaps, ...selectedGaps]),
    "",
    "## Loop Warnings",
    "",
    ...(loopWarnings.length ? loopWarnings.map((issue) => `* ${issue.usageKey ?? "board"} - ${issue.message}`) : ["* none"]),
    "",
    "## Unknown License On Selected Assets",
    "",
    ...(licenseWarnings.length ? licenseWarnings.map((issue) => `* ${issue.usageKey ?? "board"} - ${issue.message}`) : ["* none"]),
  ];
  return `${lines.join("\n")}\n`;
}

function listItems(items: SoundUsageItemRecord[]): string[] {
  return items.length ? items.map((item) => `* ${item.key} - ${item.displayName}`) : ["* none"];
}

function fileNameForProjectExport(format: Required<SoundBoardExportOptions>["format"]): string {
  switch (format) {
    case "unity_manifest":
      return "UnitySoundUsageManifest.json";
    case "unreal_manifest":
      return "UnrealSoundUsageManifest.csv";
    case "monogame_manifest":
      return "MonoGameSoundUsageContent.txt";
    case "codex_instruction":
      return "suwol-sound-usage-codex.md";
    case "sound_pack":
      return "suwol-sound-pack-plan.json";
    case "missing_report":
      return "suwol-missing-sound-report.md";
    case "generic_manifest":
    default:
      return "suwol-sound-usage-manifest.json";
  }
}

function kindForFormat(format: Required<SoundBoardExportOptions>["format"]): SoundBoardExportPreview["plannedFiles"][number]["kind"] {
  if (format === "codex_instruction" || format === "missing_report") {
    return "markdown";
  }
  if (format === "unreal_manifest") {
    return "csv";
  }
  if (format === "monogame_manifest") {
    return "metadata";
  }
  return format === "sound_pack" ? "metadata" : "manifest";
}

function estimateCopiedFiles(context: BoardContext, options: Required<SoundBoardExportOptions>): number {
  if (!options.copySelectedAudioFiles && !options.copyCandidates) {
    return 0;
  }
  const source = options.copyCandidates ? context.candidatesByItemId : context.selectedByItemId;
  return Array.from(source.values())
    .flat()
    .filter((candidate) => candidate.asset && !candidate.asset.fileMissing)
    .length;
}

function estimateSkippedFiles(context: BoardContext): number {
  return Array.from(context.selectedByItemId.values())
    .flat()
    .filter((candidate) => !candidate.asset || candidate.asset.fileMissing || !candidate.asset.playable)
    .length;
}

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
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

function safePathSegment(input: string): string {
  return safeFileName(input).replace(/\.[^.]+$/, "") || "audio";
}

function inferMonoGameImporter(fileName: string): string {
  const ext = extname(fileName).toLowerCase();
  return ext === ".wav" ? "WavImporter" : "Mp3Importer";
}

function escapeMarkdown(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function failAll(summary: BatchResult, message: string): BatchResult {
  summary.failed = summary.requested;
  summary.success = 0;
  summary.failures.push({ assetId: "sound-board", reason: message });
  return summary;
}
