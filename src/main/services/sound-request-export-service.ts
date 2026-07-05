import { access, mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import type { AssetListItem, BatchResult } from "../../shared/library-types";
import type {
  GameProjectRecord,
  SoundProjectChecklistItemRecord,
  SoundProjectStyleGuideRecord,
  SoundRequestExportFormat,
  SoundRequestExportOptions,
  SoundRequestExportPreview,
  SoundRequestExportResult,
  SoundUsageCandidateRecord,
  SoundUsageItemRecord,
} from "../../shared/sound-board-types";
import type { AssetService } from "./asset-service";
import { createBatchResult } from "./batch-result";
import { GameProjectService } from "./game-project-service";
import { toCsv } from "./game-audio-manifest-service";
import type { LibraryService } from "./library-service";
import { SoundBoardValidationService } from "./sound-board-validation-service";
import { SoundCandidateService } from "./sound-candidate-service";
import { SoundChecklistService } from "./sound-checklist-service";
import { renderStyleGuideMarkdown, SoundStyleGuideService } from "./sound-style-guide-service";
import { SoundUsageService } from "./sound-usage-service";

interface SoundRequestContext {
  project: GameProjectRecord;
  items: SoundUsageItemRecord[];
  candidatesByItemId: Map<string, SoundUsageCandidateRecord[]>;
  styleGuide: SoundProjectStyleGuideRecord;
  checklist: SoundProjectChecklistItemRecord[];
  validation: Awaited<ReturnType<SoundBoardValidationService["validateBoard"]>>;
  options: Required<SoundRequestExportOptions>;
}

export class SoundRequestExportService {
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

  async preview(input: SoundRequestExportOptions, outputDirectory?: string): Promise<SoundRequestExportPreview> {
    const options = normalizeSoundRequestOptions(input);
    const context = await this.buildContext(options);
    const content = renderSoundRequest(context);
    return {
      ok: options.documentType === "request" ? context.validation.ok : true,
      projectId: options.projectId,
      format: options.format,
      itemCount: context.items.length,
      candidateCount: Array.from(context.candidatesByItemId.values()).reduce((sum, candidates) => sum + candidates.length, 0),
      warningCount: options.documentType === "request" ? context.validation.issues.filter((issue) => issue.severity === "warning").length : 0,
      errorCount: options.documentType === "request" ? context.validation.issues.filter((issue) => issue.severity === "error").length : 0,
      plannedFiles: [{ path: join(outputDirectory ?? "<choose-folder>", fileNameForFormat(options.format, options.documentType)), kind: kindForFormat(options.format) }],
      warnings: options.documentType === "request" ? context.validation.issues.filter((issue) => issue.severity === "warning").map((issue) => issue.message) : [],
      validationIssues: options.documentType === "request" ? context.validation.issues : [],
      previewText: content.length > 16000 ? `${content.slice(0, 16000)}\n...` : content,
    };
  }

  async export(input: SoundRequestExportOptions, outputDirectory: string): Promise<SoundRequestExportResult> {
    const options = normalizeSoundRequestOptions(input);
    const summary = createBatchResult(0);
    try {
      const context = await this.buildContext(options);
      summary.requested = context.items.length;
      summary.warnings.push(...context.validation.issues.filter((issue) => issue.severity === "warning").map((issue) => issue.message));
      await mkdir(outputDirectory, { recursive: true });
      const outputPath = await writeUniqueTextFile(outputDirectory, fileNameForFormat(options.format, options.documentType), renderSoundRequest(context));
      summary.success = context.items.length;
      return { ok: true, outputPath, files: [outputPath], summary };
    } catch (error) {
      summary.failed = summary.requested;
      return {
        ok: false,
        files: [],
        summary: failAll(summary, error instanceof Error ? error.message : String(error)),
        error: {
          code: "SOUND_REQUEST_EXPORT_FAILED",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  async createStyleGuideMarkdown(projectId: string): Promise<string> {
    return this.styleGuideService.createMarkdown(projectId);
  }

  async createChecklistMarkdown(projectId: string): Promise<string> {
    return this.checklistService.createMarkdown(projectId);
  }

  private async buildContext(options: Required<SoundRequestExportOptions>): Promise<SoundRequestContext> {
    const project = this.projectService.getProject(options.projectId);
    if (!project) {
      throw new Error("PROJECT_NOT_FOUND");
    }
    const allItems = await this.usageService.listItems({ projectId: options.projectId });
    const itemIdSet = options.usageItemIds.length > 0 ? new Set(options.usageItemIds) : null;
    const scopedItems = itemIdSet ? allItems.filter((item) => itemIdSet.has(item.id)) : allItems;
    const items = options.includeMissingItems
      ? scopedItems
      : scopedItems.filter((item) => item.candidateCount > 0 || item.selectedCandidateCount > 0);
    const candidatesByItemId = new Map<string, SoundUsageCandidateRecord[]>();
    for (const item of items) {
      const candidates = (await this.candidateService.listCandidates(item.id)).filter(
        (candidate) => options.includeRejectedCandidates || !candidate.rejected,
      );
      candidatesByItemId.set(item.id, options.includeCandidates ? candidates : candidates.filter((candidate) => candidate.selected));
    }
    return {
      project,
      items,
      candidatesByItemId,
      styleGuide: this.styleGuideService.get(options.projectId),
      checklist: this.checklistService.list(options.projectId).items,
      validation: await this.validationService.validateBoard(options.projectId),
      options,
    };
  }
}

export function normalizeSoundRequestOptions(input: SoundRequestExportOptions): Required<SoundRequestExportOptions> {
  return {
    projectId: input.projectId,
    format: input.format ?? "markdown",
    documentType: input.documentType ?? "request",
    usageItemIds: input.usageItemIds ?? [],
    includeMissingItems: input.includeMissingItems ?? true,
    includeCandidates: input.includeCandidates ?? true,
    includeRejectedCandidates: input.includeRejectedCandidates ?? false,
    includeStyleGuide: input.includeStyleGuide ?? true,
    includeChecklist: input.includeChecklist ?? true,
    includeWorkNotes: input.includeWorkNotes ?? false,
    includeReviewNotes: input.includeReviewNotes ?? false,
    includeCandidateReviewNotes: input.includeCandidateReviewNotes ?? false,
    includeDecisionNotes: input.includeDecisionNotes ?? false,
    includeAbsolutePaths: input.includeAbsolutePaths ?? false,
    includeRights: input.includeRights ?? true,
  };
}

function renderSoundRequest(context: SoundRequestContext): string {
  if (context.options.documentType === "style_guide") {
    return thisStyleGuideMarkdown(context);
  }
  if (context.options.documentType === "checklist") {
    return checklistMarkdown(context);
  }
  switch (context.options.format) {
    case "csv":
      return createSoundRequestCsv(context);
    case "json":
      return `${JSON.stringify(createSoundRequestJson(context), null, 2)}\n`;
    case "markdown":
    default:
      return createSoundRequestMarkdown(context);
  }
}

function thisStyleGuideMarkdown(context: SoundRequestContext): string {
  return renderStyleGuideMarkdown(context.project.name, context.styleGuide);
}

function checklistMarkdown(context: SoundRequestContext): string {
  return [
    "# Project Sound Checklist",
    "",
    `Project: ${escapeMarkdown(context.project.name)}`,
    "",
    ...formatChecklist(context.checklist),
    "",
  ].join("\n");
}

function createSoundRequestMarkdown(context: SoundRequestContext): string {
  const missingRequired = context.items.filter((item) => item.required && item.selectedCandidateCount === 0);
  const needsReview = context.items.filter((item) =>
    ["needs_candidates", "reviewing", "selected"].includes(item.status) || (item.selectedCandidateCount > 0 && item.status !== "approved"),
  );
  const lines = [
    "# Sound Request",
    "",
    `Project: ${escapeMarkdown(context.project.name)}`,
    `Generated: ${new Date().toISOString()}`,
    "",
  ];
  if (context.options.includeStyleGuide) {
    lines.push("## Style Guide Summary", "", styleGuideSummary(context.project.name, context.styleGuide), "");
  }
  if (context.options.includeChecklist) {
    lines.push("## Project Checklist", "", ...formatChecklist(context.checklist), "");
  }
  lines.push("## Required Missing Sounds", "", ...formatUsageItems(missingRequired, context), "");
  lines.push("## Needs Review", "", ...formatUsageItems(needsReview, context), "");
  lines.push("## Candidate Notes", "");
  for (const item of context.items) {
    const candidates = context.candidatesByItemId.get(item.id) ?? [];
    if (candidates.length === 0) {
      continue;
    }
    lines.push(`### ${escapeMarkdown(item.key)}`, "");
    for (const candidate of candidates) {
      lines.push(formatCandidate(candidate, context.options));
    }
    lines.push("");
  }
  lines.push("## Risks", "");
  const risks = context.validation.issues.filter((issue) => issue.severity !== "info");
  lines.push(...(risks.length ? risks.map((issue) => `- [${issue.severity}] ${escapeMarkdown(issue.usageKey ?? "project")} - ${escapeMarkdown(issue.message)}`) : ["- none"]));
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function createSoundRequestCsv(context: SoundRequestContext): string {
  return toCsv(
    context.items.map((item) => ({
      project: context.project.name,
      usageKey: item.key,
      displayName: item.displayName,
      category: item.category,
      priority: item.priority,
      status: item.status,
      required: item.required ? "true" : "false",
      loopRequired: item.loopRequired ? "true" : "false",
      targetDurationMs: item.targetDurationMs ?? "",
      description: item.description,
      workNote: context.options.includeWorkNotes ? item.workNote : "",
      reviewNote: context.options.includeReviewNotes ? item.reviewNote : "",
      decisionNote: context.options.includeDecisionNotes ? item.decisionNote : "",
      assignee: item.assignee,
      dueLabel: item.dueLabel,
      selectedAsset: item.selectedAsset?.fileName ?? "",
      risks: context.validation.issues
        .filter((issue) => issue.usageItemId === item.id && issue.severity !== "info")
        .map((issue) => issue.code)
        .join(";"),
    })),
  );
}

function createSoundRequestJson(context: SoundRequestContext): Record<string, unknown> {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    project: {
      id: context.project.id,
      name: context.project.name,
      engineType: context.project.engineType,
      rootNamespace: context.project.rootNamespace,
    },
    styleGuide: context.options.includeStyleGuide ? context.styleGuide : undefined,
    checklist: context.options.includeChecklist ? context.checklist : undefined,
    validation: context.validation.issues,
    usages: context.items.map((item) => ({
      usageKey: item.key,
      displayName: item.displayName,
      category: item.category,
      priority: item.priority,
      status: item.status,
      required: item.required,
      loopRequired: item.loopRequired,
      targetDurationMs: item.targetDurationMs,
      targetLoudnessNote: item.targetLoudnessNote,
      description: item.description,
      notes: item.notes,
      workNote: context.options.includeWorkNotes ? item.workNote : undefined,
      reviewNote: context.options.includeReviewNotes ? item.reviewNote : undefined,
      decisionNote: context.options.includeDecisionNotes ? item.decisionNote : undefined,
      assignee: item.assignee,
      dueLabel: item.dueLabel,
      selectedAsset: createAssetRef(item.selectedAsset, context.options),
      candidates: (context.candidatesByItemId.get(item.id) ?? []).map((candidate) => createCandidateJson(candidate, context.options)),
    })),
  };
}

function styleGuideSummary(projectName: string, guide: SoundProjectStyleGuideRecord): string {
  return renderStyleGuideMarkdown(projectName, guide)
    .split("\n")
    .filter((line) => !line.startsWith("# "))
    .join("\n")
    .trim() || "TODO";
}

function formatChecklist(items: SoundProjectChecklistItemRecord[]): string[] {
  return items.length
    ? items.map((item) => `- [${item.checked ? "x" : " "}] ${escapeMarkdown(item.label)}${item.note ? ` - ${escapeMarkdown(item.note)}` : ""}`)
    : ["- [ ] TODO: Add checklist items"];
}

function formatUsageItems(items: SoundUsageItemRecord[], context: SoundRequestContext): string[] {
  if (items.length === 0) {
    return ["- none"];
  }
  return items.map((item) => {
    const notes = [
      context.options.includeWorkNotes && item.workNote ? `work: ${item.workNote}` : "",
      context.options.includeReviewNotes && item.reviewNote ? `review: ${item.reviewNote}` : "",
      context.options.includeDecisionNotes && item.decisionNote ? `decision: ${item.decisionNote}` : "",
    ].filter(Boolean);
    return [
      `- ${escapeMarkdown(item.key)} (${item.category}, ${item.priority}, ${item.status})`,
      `  - display: ${escapeMarkdown(item.displayName)}`,
      `  - required: ${item.required ? "yes" : "no"}, loop: ${item.loopRequired ? "yes" : "no"}`,
      item.description ? `  - description: ${escapeMarkdown(item.description)}` : "",
      item.targetDurationMs ? `  - target duration: ${item.targetDurationMs} ms` : "",
      item.assignee ? `  - assignee: ${escapeMarkdown(item.assignee)}` : "",
      item.dueLabel ? `  - due: ${escapeMarkdown(item.dueLabel)}` : "",
      notes.length ? `  - notes: ${escapeMarkdown(notes.join(" / "))}` : "",
    ].filter(Boolean).join("\n");
  });
}

function formatCandidate(candidate: SoundUsageCandidateRecord, options: Required<SoundRequestExportOptions>): string {
  const assetName = candidate.asset?.fileName ?? candidate.assetId;
  const lines = [
    `- ${escapeMarkdown(assetName)}${candidate.selected ? " [selected]" : ""}${candidate.approved ? " [approved]" : ""}${candidate.rejected ? " [rejected]" : ""}`,
    `  - fit score: ${candidate.fitScore === null ? "n/a" : Math.round(candidate.fitScore * 100)}`,
    options.includeCandidateReviewNotes && candidate.ratingForUsage !== null ? `  - rating for usage: ${candidate.ratingForUsage}/5` : "",
    options.includeCandidateReviewNotes && candidate.pros ? `  - pros: ${escapeMarkdown(candidate.pros)}` : "",
    options.includeCandidateReviewNotes && candidate.cons ? `  - cons: ${escapeMarkdown(candidate.cons)}` : "",
    options.includeCandidateReviewNotes && candidate.reviewNote ? `  - review: ${escapeMarkdown(candidate.reviewNote)}` : "",
    options.includeDecisionNotes && candidate.decisionReason ? `  - decision: ${escapeMarkdown(candidate.decisionReason)}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

function createCandidateJson(candidate: SoundUsageCandidateRecord, options: Required<SoundRequestExportOptions>): Record<string, unknown> {
  return {
    candidateId: candidate.id,
    assetId: candidate.assetId,
    selected: candidate.selected,
    approved: candidate.approved,
    rejected: candidate.rejected,
    fitScore: candidate.fitScore,
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
    asset: createAssetRef(candidate.asset, options),
  };
}

function createAssetRef(asset: AssetListItem | null, options: Required<SoundRequestExportOptions>): Record<string, unknown> | null {
  if (!asset) {
    return null;
  }
  return {
    id: asset.id,
    fileName: asset.fileName,
    title: asset.title,
    durationMs: asset.audioAnalysis?.durationMs ?? null,
    playable: asset.playable,
    fileMissing: asset.fileMissing,
    sourcePath: options.includeAbsolutePaths ? getAssetFilePath(asset) : undefined,
  };
}

function fileNameForFormat(format: SoundRequestExportFormat, documentType: Required<SoundRequestExportOptions>["documentType"] = "request"): string {
  if (documentType === "style_guide") {
    return "project-style-guide.md";
  }
  if (documentType === "checklist") {
    return "project-checklist.md";
  }
  switch (format) {
    case "csv":
      return "suwol-sound-request.csv";
    case "json":
      return "suwol-sound-request.json";
    case "markdown":
    default:
      return "suwol-sound-request.md";
  }
}

function kindForFormat(format: SoundRequestExportFormat): SoundRequestExportPreview["plannedFiles"][number]["kind"] {
  return format;
}

function getAssetFilePath(asset: AssetListItem): string | null {
  if (asset.fileMissing) {
    return null;
  }
  return asset.importMode === "copy" && asset.storedPath ? asset.storedPath : asset.originalPath;
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

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function failAll(summary: BatchResult, message: string): BatchResult {
  summary.failed = summary.requested;
  summary.success = 0;
  summary.failures.push({ assetId: "sound-request", reason: message });
  return summary;
}

function escapeMarkdown(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
