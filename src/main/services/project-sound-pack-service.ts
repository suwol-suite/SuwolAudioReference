import { access, copyFile, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { AssetListItem } from "../../shared/library-types";
import type { AssetRightsMetadata } from "../../shared/export-types";
import type {
  GameProjectRecord,
  SoundBoardValidationIssue,
  SoundUsageCandidateRecord,
  SoundUsageCategory,
  SoundUsageItemRecord,
} from "../../shared/sound-board-types";
import type {
  ProjectSoundPackCopyFile,
  ProjectSoundPackDryRun,
  ProjectSoundPackEngineProfile,
  ProjectSoundPackExportResult,
  ProjectSoundPackFilenamePolicy,
  ProjectSoundPackIssue,
  ProjectSoundPackManifestAsset,
  ProjectSoundPackOptions,
  ProjectSoundPackPlannedFile,
  ProjectSoundPackProfile,
  ProjectSoundPackRenamePlanEntry,
  ProjectSoundPackSummary,
  ProjectSoundPackUsageManifestItem,
} from "../../shared/project-sound-pack-types";
import { APP_NAME } from "../../shared/app-metadata";
import { createEmptyRights, safeFileName, toCsv } from "./game-audio-manifest-service";
import { safeSoundPackFolderName } from "./sound-pack-export-service";
import type { AssetService } from "./asset-service";
import { GameProjectService } from "./game-project-service";
import type { LibraryService } from "./library-service";
import { SoundBoardValidationService } from "./sound-board-validation-service";
import { SoundCandidateService } from "./sound-candidate-service";
import { SoundChecklistService } from "./sound-checklist-service";
import { SoundStyleGuideService } from "./sound-style-guide-service";
import { SoundUsageService } from "./sound-usage-service";

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

interface PlannedUsageAsset {
  item: SoundUsageItemRecord;
  candidate: SoundUsageCandidateRecord;
  asset: AssetListItem;
  rights: AssetRightsMetadata;
  outputFileName: string;
  outputRelativePath: string;
  sourcePath: string | null;
  includedAsCandidate: boolean;
  collisionResolved: boolean;
}

interface ProjectSoundPackBuild extends ProjectSoundPackDryRun {
  project: GameProjectRecord;
  items: SoundUsageItemRecord[];
  usageAssets: PlannedUsageAsset[];
  candidatesByItemId: Map<string, SoundUsageCandidateRecord[]>;
  rightsByAssetId: Map<string, AssetRightsMetadata>;
  options: Required<ProjectSoundPackOptions>;
  boardValidationIssues: SoundBoardValidationIssue[];
  styleGuideMarkdown: string;
  checklistMarkdown: string;
}

export class ProjectSoundPackService {
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

  getProfiles(): ProjectSoundPackProfile[] {
    return [
      { id: "generic", name: "Generic", audioRoot: "audio", manifestFiles: ["manifest.json"] },
      { id: "unity", name: "Unity", audioRoot: "Assets/Audio", manifestFiles: ["manifest.json", "UnityAudioManifest.json"] },
      {
        id: "unreal",
        name: "Unreal",
        audioRoot: "ContentImport/Audio",
        manifestFiles: ["manifest.json", "UnrealAudioManifest.json", "UnrealAudioManifest.csv"],
      },
      {
        id: "monogame",
        name: "MonoGame",
        audioRoot: "Content/Audio",
        manifestFiles: ["manifest.json", "MonoGameAudioManifest.json", "MonoGameContentList.txt"],
      },
    ];
  }

  async preview(input: ProjectSoundPackOptions, outputDirectory?: string): Promise<ProjectSoundPackDryRun> {
    return stripBuild(await this.build(input, outputDirectory));
  }

  async export(input: ProjectSoundPackOptions, outputDirectory: string): Promise<ProjectSoundPackExportResult> {
    const build = await this.build({ ...input, outputPath: input.outputPath ?? outputDirectory }, outputDirectory);
    if (build.errors.length > 0) {
      return {
        ok: false,
        files: [],
        summary: build.summary,
        warnings: build.warnings,
        errors: build.errors,
        error: {
          code: "PROJECT_SOUND_PACK_VALIDATION_BLOCKED",
          message: "Project sound pack validation blocked export.",
        },
      };
    }
    if (build.warnings.length > 0 && !build.options.acknowledgeWarnings) {
      return {
        ok: false,
        files: [],
        summary: build.summary,
        warnings: build.warnings,
        errors: [
          {
            severity: "error",
            code: "PROJECT_SOUND_PACK_VALIDATION_BLOCKED",
            message: "Warnings must be acknowledged before exporting.",
          },
        ],
        error: {
          code: "PROJECT_SOUND_PACK_VALIDATION_BLOCKED",
          message: "Warnings must be acknowledged before exporting.",
        },
      };
    }

    const tempRoot = join(dirname(build.outputRoot), `.${safeSoundPackFolderName(build.project.name)}-${randomUUID()}.tmp`);
    const writtenFiles: string[] = [];
    try {
      await mkdir(dirname(tempRoot), { recursive: true });
      await mkdir(tempRoot, { recursive: false });
      if (build.options.copyAudioFiles) {
        for (const file of build.filesToCopy) {
          const targetPath = join(tempRoot, file.outputRelativePath);
          await mkdir(dirname(targetPath), { recursive: true });
          await copyFile(file.sourcePath, targetPath);
          writtenFiles.push(targetPath);
        }
      }
      for (const file of renderTextFiles(build)) {
        const targetPath = join(tempRoot, file.relativePath);
        await mkdir(dirname(targetPath), { recursive: true });
        await writeFile(targetPath, file.content, "utf8");
        writtenFiles.push(targetPath);
      }
      await rename(tempRoot, build.outputRoot);
      return {
        ok: true,
        outputPath: build.outputRoot,
        files: build.plannedFiles.map((file) => join(build.outputRoot, file.relativePath)),
        summary: build.summary,
        warnings: build.warnings,
        errors: [],
      };
    } catch (error) {
      await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
      return {
        ok: false,
        files: writtenFiles,
        partialOutputPath: tempRoot,
        summary: build.summary,
        warnings: build.warnings,
        errors: [
          {
            severity: "error",
            code: "PROJECT_SOUND_PACK_WRITE_FAILED",
            message: error instanceof Error ? error.message : String(error),
          },
        ],
        error: {
          code: "PROJECT_SOUND_PACK_WRITE_FAILED",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  private async build(input: ProjectSoundPackOptions, outputDirectory?: string): Promise<ProjectSoundPackBuild> {
    const options = normalizeOptions(input);
    const project = this.projectService.getProject(options.projectId);
    if (!project) {
      throw new Error("PROJECT_SOUND_PACK_NO_PROJECT");
    }
    const outputRoot = createOutputRoot(project, options, outputDirectory);
    const allItems = await this.usageService.listItems({ projectId: project.id });
    const itemIdSet = options.usageItemIds.length > 0 ? new Set(options.usageItemIds) : null;
    const items = itemIdSet ? allItems.filter((item) => itemIdSet.has(item.id)) : allItems;
    const validation = await this.validationService.validateBoard(project.id);
    const candidatesByItemId = new Map<string, SoundUsageCandidateRecord[]>();
    const allCandidates: SoundUsageCandidateRecord[] = [];
    for (const item of items) {
      const candidates = await this.candidateService.listCandidates(item.id);
      candidatesByItemId.set(item.id, candidates);
      allCandidates.push(...candidates);
    }
    const rightsByAssetId = this.loadRightsMap(unique(allCandidates.map((candidate) => candidate.assetId)));
    const warnings: ProjectSoundPackIssue[] = [];
    const errors: ProjectSoundPackIssue[] = [];
    const plannedAssets: PlannedUsageAsset[] = [];
    const fileCounts = new Map<string, number>();
    const usageExportCounts = new Map<string, number>();
    let skippedRejectedCandidates = 0;
    let selectedButNotApprovedCount = 0;
    let skippedMissingFiles = 0;

    for (const item of items) {
      const candidates = candidatesByItemId.get(item.id) ?? [];
      const selectedCandidates = candidates.filter((candidate) => candidate.selected && !candidate.rejected);
      const approvedSelected = selectedCandidates.filter((candidate) => candidate.approved);
      if (item.required && approvedSelected.length === 0) {
        pushIssue(options.blockIfRequiredMissing ? errors : warnings, {
          severity: options.blockIfRequiredMissing ? "error" : "warning",
          code: "REQUIRED_MISSING",
          message: `Required usage has no approved selected asset: ${item.key}`,
          usageItemId: item.id,
          usageKey: item.key,
        });
      }
      for (const candidate of candidates) {
        if (candidate.rejected && !options.includeRejectedCandidates) {
          skippedRejectedCandidates += 1;
          continue;
        }
        if (candidate.selected && !candidate.approved) {
          selectedButNotApprovedCount += 1;
          pushIssue(warnings, {
            severity: "warning",
            code: "SELECTED_NOT_APPROVED",
            message: `Selected asset is not approved: ${item.key}`,
            usageItemId: item.id,
            usageKey: item.key,
            assetId: candidate.assetId,
            fileName: candidate.asset?.fileName,
          });
        }
        const includeSelected = candidate.selected && (candidate.approved || (!options.approvedOnly && options.includeSelectedUnapproved));
        const includeCandidate = !candidate.selected && options.includeCandidates;
        if (!includeSelected && !includeCandidate) {
          continue;
        }
        if (!candidate.asset) {
          skippedMissingFiles += 1;
          pushIssue(errors, {
            severity: "error",
            code: "PROJECT_SOUND_PACK_MISSING_FILE",
            message: `Candidate asset record is missing: ${item.key}`,
            usageItemId: item.id,
            usageKey: item.key,
            assetId: candidate.assetId,
          });
          continue;
        }
        const sourcePath = getAssetFilePath(candidate.asset);
        const sourceExists = sourcePath ? await pathExists(sourcePath) : false;
        if (!sourcePath || !sourceExists) {
          skippedMissingFiles += 1;
          pushIssue(options.blockIfSelectedFileMissing ? errors : warnings, {
            severity: options.blockIfSelectedFileMissing ? "error" : "warning",
            code: "PROJECT_SOUND_PACK_MISSING_FILE",
            message: `Selected source file is missing: ${candidate.asset.fileName}`,
            usageItemId: item.id,
            usageKey: item.key,
            assetId: candidate.asset.id,
            fileName: candidate.asset.fileName,
          });
          continue;
        }
        const rights = rightsByAssetId.get(candidate.asset.id) ?? createEmptyRights(candidate.asset.id);
        validateAssetRisk(options, item, candidate.asset, rights, warnings, errors);
        const usageIndex = (usageExportCounts.get(item.key) ?? 0) + 1;
        usageExportCounts.set(item.key, usageIndex);
        const baseFileName = createOutputFileName(item, candidate.asset, options.filenamePolicy, usageIndex);
        const outputFileName = makeUniqueFileName(baseFileName, fileCounts);
        const collisionResolved = outputFileName !== baseFileName;
        const outputRelativePath = toPosixPath(join(getAudioRoot(options.engineProfile), categoryFolder(item.category, options.engineProfile), outputFileName));
        plannedAssets.push({
          item,
          candidate,
          asset: candidate.asset,
          rights,
          outputFileName,
          outputRelativePath,
          sourcePath,
          includedAsCandidate: includeCandidate,
          collisionResolved,
        });
      }
    }

    const duplicateOutputFilenameCount = plannedAssets.filter((asset) => asset.collisionResolved).length;
    if (duplicateOutputFilenameCount > 0) {
      pushIssue(options.blockIfDuplicateOutputFilename ? errors : warnings, {
        severity: options.blockIfDuplicateOutputFilename ? "error" : "warning",
        code: "PROJECT_SOUND_PACK_DUPLICATE_OUTPUT",
        message: `Duplicate output filenames were resolved with suffixes: ${duplicateOutputFilenameCount}`,
      });
    }
    if (plannedAssets.filter((asset) => !asset.includedAsCandidate).length === 0) {
      pushIssue(errors, {
        severity: "error",
        code: "PROJECT_SOUND_PACK_NO_SELECTED_ASSETS",
        message: "No approved selected assets are available for this sound pack.",
      });
    }
    if (!outputRoot.includes("<choose-folder>") && await pathExists(outputRoot)) {
      pushIssue(errors, {
        severity: "error",
        code: "PROJECT_SOUND_PACK_OUTPUT_EXISTS",
        message: `Output folder already exists: ${outputRoot}`,
      });
    }

    const renamePlan = plannedAssets.map((asset) => createRenamePlanEntry(asset));
    const filesToCopy: ProjectSoundPackCopyFile[] = options.copyAudioFiles
      ? plannedAssets.map((asset) => ({
          assetId: asset.asset.id,
          usageItemId: asset.item.id,
          usageKey: asset.item.key,
          sourcePath: asset.sourcePath ?? "",
          outputRelativePath: asset.outputRelativePath,
          originalFileName: asset.asset.fileName,
          outputFileName: asset.outputFileName,
          candidateId: asset.candidate.id,
          selected: asset.candidate.selected,
          approved: asset.candidate.approved,
        }))
      : [];
    const manifestsToWrite = createManifestPlan(options.engineProfile, options.includeManifest);
    const docsToWrite = createDocPlan(options);
    const metadataToWrite = createMetadataPlan();
    const plannedFiles = [
      ...filesToCopy.map((file): ProjectSoundPackPlannedFile => ({ type: "audio", relativePath: file.outputRelativePath, assetId: file.assetId })),
      ...manifestsToWrite,
      ...docsToWrite,
      ...metadataToWrite,
    ];
    const summary: ProjectSoundPackSummary = {
      requestedUsageItems: items.length,
      includedUsageItems: new Set(plannedAssets.map((asset) => asset.item.id)).size,
      selectedAssetCount: plannedAssets.filter((asset) => asset.candidate.selected).length,
      approvedSelectedCount: plannedAssets.filter((asset) => asset.candidate.selected && asset.candidate.approved).length,
      filesToCopy: filesToCopy.length,
      skippedMissingFiles,
      skippedRejectedCandidates,
      selectedButNotApprovedCount,
      unknownLicenseCount: countUnknownLicense(plannedAssets),
      creditRequiredCount: countCreditRequired(plannedAssets),
      duplicateOutputFilenameCount,
      renameCount: renamePlan.filter((entry) => entry.renamed).length,
      validationWarningCount: warnings.length + validation.issues.filter((issue) => issue.severity === "warning").length,
      validationErrorCount: errors.length + validation.issues.filter((issue) => issue.severity === "error").length,
      docsToWrite: docsToWrite.length,
      manifestsToWrite: manifestsToWrite.length,
    };

    return {
      ok: errors.length === 0,
      project,
      items,
      usageAssets: plannedAssets,
      candidatesByItemId,
      rightsByAssetId,
      options,
      boardValidationIssues: validation.issues,
      styleGuideMarkdown: options.includeStyleGuide ? this.styleGuideService.createMarkdown(project.id) : "",
      checklistMarkdown: options.includeChecklist ? this.checklistService.createMarkdown(project.id) : "",
      projectId: project.id,
      projectName: project.name,
      engineProfile: options.engineProfile,
      outputRoot,
      filesToCopy,
      manifestsToWrite,
      docsToWrite,
      metadataToWrite,
      plannedFiles,
      renamePlan,
      warnings,
      errors,
      summary,
      outputTree: createOutputTree(plannedFiles),
    };
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
}

function normalizeOptions(input: ProjectSoundPackOptions): Required<ProjectSoundPackOptions> {
  return {
    projectId: input.projectId,
    engineProfile: input.engineProfile ?? "generic",
    soundPackName: input.soundPackName ?? "",
    usageItemIds: input.usageItemIds ?? [],
    approvedOnly: input.approvedOnly ?? true,
    includeSelectedUnapproved: input.includeSelectedUnapproved ?? false,
    includeCandidates: input.includeCandidates ?? false,
    includeRejectedCandidates: input.includeRejectedCandidates ?? false,
    includeMissingReport: input.includeMissingReport ?? true,
    includeValidationReport: input.includeValidationReport ?? true,
    includeRights: input.includeRights ?? true,
    includeBoardSummary: input.includeBoardSummary ?? true,
    includeReadme: input.includeReadme ?? true,
    includeCredits: input.includeCredits ?? true,
    includeManifest: input.includeManifest ?? true,
    includeStyleGuide: input.includeStyleGuide ?? true,
    includeChecklist: input.includeChecklist ?? true,
    includeWorkNotes: input.includeWorkNotes ?? false,
    includeReviewNotes: input.includeReviewNotes ?? false,
    includeCandidateReviewNotes: input.includeCandidateReviewNotes ?? false,
    includeDecisionNotes: input.includeDecisionNotes ?? false,
    copyAudioFiles: input.copyAudioFiles ?? true,
    filenamePolicy: input.filenamePolicy ?? "keep_original",
    blockIfRequiredMissing: input.blockIfRequiredMissing ?? false,
    blockIfSelectedFileMissing: input.blockIfSelectedFileMissing ?? true,
    blockIfUnknownLicense: input.blockIfUnknownLicense ?? false,
    blockIfCreditMissing: input.blockIfCreditMissing ?? false,
    blockIfLoopMismatch: input.blockIfLoopMismatch ?? false,
    blockIfPlaybackUnsupported: input.blockIfPlaybackUnsupported ?? false,
    blockIfDuplicateOutputFilename: input.blockIfDuplicateOutputFilename ?? false,
    acknowledgeWarnings: input.acknowledgeWarnings ?? false,
    outputPath: input.outputPath ?? "",
  };
}

function stripBuild(build: ProjectSoundPackBuild): ProjectSoundPackDryRun {
  return {
    ok: build.ok,
    projectId: build.projectId,
    projectName: build.projectName,
    engineProfile: build.engineProfile,
    outputRoot: build.outputRoot,
    filesToCopy: build.filesToCopy,
    manifestsToWrite: build.manifestsToWrite,
    docsToWrite: build.docsToWrite,
    metadataToWrite: build.metadataToWrite,
    plannedFiles: build.plannedFiles,
    renamePlan: build.renamePlan,
    warnings: build.warnings,
    errors: build.errors,
    summary: build.summary,
    outputTree: build.outputTree,
  };
}

function createOutputRoot(
  project: GameProjectRecord,
  options: Required<ProjectSoundPackOptions>,
  outputDirectory?: string,
): string {
  const parent = options.outputPath || outputDirectory || "<choose-folder>";
  const folder = safeSoundPackFolderName(options.soundPackName || `${project.name}-sound-pack`);
  return join(parent, folder);
}

function validateAssetRisk(
  options: Required<ProjectSoundPackOptions>,
  item: SoundUsageItemRecord,
  asset: AssetListItem,
  rights: AssetRightsMetadata,
  warnings: ProjectSoundPackIssue[],
  errors: ProjectSoundPackIssue[],
): void {
  if (options.includeRights && (!rights.licenseName || rights.commercialUseStatus === "unknown")) {
    pushIssue(options.blockIfUnknownLicense ? errors : warnings, {
      severity: options.blockIfUnknownLicense ? "error" : "warning",
      code: "UNKNOWN_LICENSE",
      message: `License metadata needs review: ${asset.fileName}`,
      usageItemId: item.id,
      usageKey: item.key,
      assetId: asset.id,
      fileName: asset.fileName,
    });
  }
  if (options.includeRights && rights.creditRequired === "yes" && !rights.attributionText.trim()) {
    pushIssue(options.blockIfCreditMissing ? errors : warnings, {
      severity: options.blockIfCreditMissing ? "error" : "warning",
      code: "CREDIT_MISSING",
      message: `Credit is required but attribution is empty: ${asset.fileName}`,
      usageItemId: item.id,
      usageKey: item.key,
      assetId: asset.id,
      fileName: asset.fileName,
    });
  }
  if (item.loopRequired && asset.audioAnalysis?.loopLikelihood !== "high" && (asset.audioAnalysis?.loopScore ?? 0) < 0.72) {
    pushIssue(options.blockIfLoopMismatch ? errors : warnings, {
      severity: options.blockIfLoopMismatch ? "error" : "warning",
      code: "LOOP_MISMATCH",
      message: `Loop-required usage has a low loop score: ${item.key}`,
      usageItemId: item.id,
      usageKey: item.key,
      assetId: asset.id,
      fileName: asset.fileName,
    });
  }
  if (!asset.playable) {
    pushIssue(options.blockIfPlaybackUnsupported ? errors : warnings, {
      severity: options.blockIfPlaybackUnsupported ? "error" : "warning",
      code: "PLAYBACK_UNSUPPORTED",
      message: `Playback support needs review: ${asset.fileName}`,
      usageItemId: item.id,
      usageKey: item.key,
      assetId: asset.id,
      fileName: asset.fileName,
    });
  }
}

function pushIssue(target: ProjectSoundPackIssue[], issue: ProjectSoundPackIssue): void {
  target.push(issue);
}

function createOutputFileName(
  item: SoundUsageItemRecord,
  asset: AssetListItem,
  policy: ProjectSoundPackFilenamePolicy,
  usageIndex: number,
): string {
  const ext = safeExtension(asset.fileName);
  if (policy === "keep_original") {
    return safeFileName(asset.fileName);
  }
  const base = policy === "category_usage_key"
    ? `${safeUsageKeyStem(item.category)}_${safeUsageKeyStem(item.key)}`
    : safeUsageKeyStem(item.key);
  const needsVariantSuffix = usageIndex > 1 || item.variantsAllowed;
  return `${needsVariantSuffix ? `${base}_${String(usageIndex).padStart(2, "0")}` : base}${ext}`;
}

function makeUniqueFileName(fileName: string, counts: Map<string, number>): string {
  const normalized = fileName.toLowerCase();
  const current = counts.get(normalized) ?? 0;
  counts.set(normalized, current + 1);
  if (current === 0) {
    return fileName;
  }
  const ext = extname(fileName);
  const stem = fileName.slice(0, fileName.length - ext.length);
  return `${stem}_${current + 1}${ext}`;
}

function createRenamePlanEntry(asset: PlannedUsageAsset): ProjectSoundPackRenamePlanEntry {
  return {
    usageKey: asset.item.key,
    assetId: asset.asset.id,
    originalFileName: asset.asset.fileName,
    outputFileName: asset.outputFileName,
    outputRelativePath: asset.outputRelativePath,
    renamed: asset.asset.fileName !== asset.outputFileName,
    collisionResolved: asset.collisionResolved,
  };
}

function createManifestPlan(engine: ProjectSoundPackEngineProfile, includeManifest: boolean): ProjectSoundPackPlannedFile[] {
  if (!includeManifest) {
    return [];
  }
  const files: ProjectSoundPackPlannedFile[] = [{ type: "manifest", relativePath: "manifest.json" }];
  if (engine === "unity") {
    files.push({ type: "manifest", relativePath: "UnityAudioManifest.json" });
  }
  if (engine === "unreal") {
    files.push({ type: "manifest", relativePath: "UnrealAudioManifest.json" });
    files.push({ type: "manifest", relativePath: "UnrealAudioManifest.csv" });
  }
  if (engine === "monogame") {
    files.push({ type: "manifest", relativePath: "MonoGameAudioManifest.json" });
    files.push({ type: "manifest", relativePath: "MonoGameContentList.txt" });
  }
  return files;
}

function createDocPlan(options: Required<ProjectSoundPackOptions>): ProjectSoundPackPlannedFile[] {
  return [
    options.includeReadme ? { type: "doc", relativePath: "README.md" } : null,
    options.includeCredits ? { type: "doc", relativePath: "credits.md" } : null,
    options.includeMissingReport ? { type: "doc", relativePath: "missing-sounds.md" } : null,
    options.includeValidationReport ? { type: "doc", relativePath: "validation-report.md" } : null,
    options.includeStyleGuide ? { type: "doc", relativePath: "style-guide.md" } : null,
    options.includeChecklist ? { type: "doc", relativePath: "checklist.md" } : null,
  ].filter((file): file is ProjectSoundPackPlannedFile => Boolean(file));
}

function createMetadataPlan(): ProjectSoundPackPlannedFile[] {
  return [
    { type: "metadata", relativePath: "metadata/usage-items.csv" },
    { type: "metadata", relativePath: "metadata/selected-assets.csv" },
    { type: "metadata", relativePath: "metadata/candidates.csv" },
    { type: "metadata", relativePath: "metadata/rights.csv" },
  ];
}

function renderTextFiles(build: ProjectSoundPackBuild): Array<{ relativePath: string; content: string }> {
  const files: Array<{ relativePath: string; content: string }> = [];
  if (build.options.includeManifest) {
    files.push({ relativePath: "manifest.json", content: jsonText(createProjectManifest(build)) });
    if (build.options.engineProfile === "unity") {
      files.push({ relativePath: "UnityAudioManifest.json", content: jsonText(createUnityManifest(build)) });
    }
    if (build.options.engineProfile === "unreal") {
      files.push({ relativePath: "UnrealAudioManifest.json", content: jsonText(createUnrealManifest(build)) });
      files.push({ relativePath: "UnrealAudioManifest.csv", content: createUnrealCsv(build) });
    }
    if (build.options.engineProfile === "monogame") {
      files.push({ relativePath: "MonoGameAudioManifest.json", content: jsonText(createMonoGameManifest(build)) });
      files.push({ relativePath: "MonoGameContentList.txt", content: createMonoGameContentList(build) });
    }
  }
  if (build.options.includeReadme) {
    files.push({ relativePath: "README.md", content: createReadme(build) });
  }
  if (build.options.includeCredits) {
    files.push({ relativePath: "credits.md", content: createCredits(build) });
  }
  if (build.options.includeMissingReport) {
    files.push({ relativePath: "missing-sounds.md", content: createMissingReport(build) });
  }
  if (build.options.includeValidationReport) {
    files.push({ relativePath: "validation-report.md", content: createValidationReport(build) });
  }
  if (build.options.includeStyleGuide) {
    files.push({ relativePath: "style-guide.md", content: build.styleGuideMarkdown });
  }
  if (build.options.includeChecklist) {
    files.push({ relativePath: "checklist.md", content: build.checklistMarkdown });
  }
  files.push({ relativePath: "metadata/usage-items.csv", content: createUsageItemsCsv(build) });
  files.push({ relativePath: "metadata/selected-assets.csv", content: createSelectedAssetsCsv(build) });
  files.push({ relativePath: "metadata/candidates.csv", content: createCandidatesCsv(build) });
  files.push({ relativePath: "metadata/rights.csv", content: createRightsCsv(build) });
  return files;
}

function createProjectManifest(build: ProjectSoundPackBuild): Record<string, unknown> {
  return {
    app: APP_NAME,
    soundPackVersion: 1,
    createdAt: new Date().toISOString(),
    project: {
      id: build.project.id,
      name: build.project.name,
      engineType: build.options.engineProfile,
      sourceEngineType: build.project.engineType,
    },
    summary: build.summary,
    folderProfile: {
      engine: build.options.engineProfile,
      audioRoot: getAudioRoot(build.options.engineProfile),
    },
    usages: createUsageManifestItems(build),
    renamePlan: build.renamePlan,
    validation: [...build.boardValidationIssues, ...build.warnings, ...build.errors],
  };
}

function createUsageManifestItems(build: ProjectSoundPackBuild): ProjectSoundPackUsageManifestItem[] {
  return build.items.map((item) => {
    const assets = build.usageAssets.filter((asset) => asset.item.id === item.id);
    const candidates = (build.candidatesByItemId.get(item.id) ?? [])
      .filter((candidate) => build.options.includeCandidates && !candidate.selected)
      .map((candidate) => {
        const planned = build.usageAssets.find((asset) => asset.candidate.id === candidate.id);
        return planned ? createManifestAsset(planned, build.options.includeRights) : null;
      })
      .filter((asset): asset is ProjectSoundPackManifestAsset => Boolean(asset));
    return {
      usageKey: item.key,
      displayName: item.displayName,
      category: item.category,
      required: item.required,
      loopRequired: item.loopRequired,
      status: item.status,
      priority: item.priority,
      selectedAssets: assets.filter((asset) => asset.candidate.selected).map((asset) => createManifestAsset(asset, build.options.includeRights)),
      candidates,
    };
  });
}

function createManifestAsset(asset: PlannedUsageAsset, includeRights: boolean): ProjectSoundPackManifestAsset {
  return {
    assetId: asset.asset.id,
    fileName: asset.asset.fileName,
    outputFileName: asset.outputFileName,
    outputPath: asset.outputRelativePath,
    durationMs: asset.asset.audioAnalysis?.durationMs ?? null,
    format: asset.asset.audioAnalysis?.format ?? asset.asset.fileExt,
    loopScore: asset.asset.audioAnalysis?.loopScore ?? null,
    volumeHint: 1,
    selected: asset.candidate.selected,
    approved: asset.candidate.approved,
    rejected: asset.candidate.rejected,
    rights: includeRights
      ? {
          licenseName: asset.rights.licenseName,
          author: asset.rights.author,
          attributionText: asset.rights.attributionText,
          sourceUrl: asset.rights.sourceUrl,
          commercialUseStatus: asset.rights.commercialUseStatus,
          creditRequired: asset.rights.creditRequired,
        }
      : undefined,
  };
}

function createUnityManifest(build: ProjectSoundPackBuild): Record<string, unknown> {
  return {
    engine: "unity",
    version: 1,
    project: build.project.name,
    audioClips: build.usageAssets.map((asset) => ({
      usageKey: asset.item.key,
      addressableKey: safeUsageKeyStem(asset.item.key),
      relativePath: asset.outputRelativePath,
      category: asset.item.category,
      loop: asset.item.loopRequired,
      volumeHint: 1,
      tags: asset.asset.tags.map((tag) => tag.name),
      license: build.options.includeRights ? licenseSummary(asset.rights) : undefined,
    })),
  };
}

function createUnrealManifest(build: ProjectSoundPackBuild): Record<string, unknown> {
  return {
    engine: "unreal",
    version: 1,
    project: build.project.name,
    audio: build.usageAssets.map((asset) => ({
      UsageKey: asset.item.key,
      Category: asset.item.category,
      OutputPath: asset.outputRelativePath,
      Loop: asset.item.loopRequired,
      VolumeHint: 1,
      LicenseName: build.options.includeRights ? asset.rights.licenseName : "",
      Attribution: build.options.includeRights ? asset.rights.attributionText : "",
      Notes: asset.item.notes,
    })),
  };
}

function createUnrealCsv(build: ProjectSoundPackBuild): string {
  return toCsv(
    build.usageAssets.map((asset) => ({
      UsageKey: asset.item.key,
      Category: asset.item.category,
      OutputPath: asset.outputRelativePath,
      Loop: asset.item.loopRequired ? "true" : "false",
      VolumeHint: 1,
      LicenseName: build.options.includeRights ? asset.rights.licenseName : "",
      Attribution: build.options.includeRights ? asset.rights.attributionText : "",
      Notes: asset.item.notes,
    })),
  );
}

function createMonoGameManifest(build: ProjectSoundPackBuild): Record<string, unknown> {
  return {
    engine: "monogame",
    version: 1,
    project: build.project.name,
    content: build.usageAssets.map((asset) => ({
      usageKey: asset.item.key,
      path: asset.outputRelativePath,
      importer: inferMonoGameImporter(asset.outputFileName),
      processor: inferMonoGameProcessor(asset.outputFileName),
      category: asset.item.category,
      loop: asset.item.loopRequired,
    })),
  };
}

function createMonoGameContentList(build: ProjectSoundPackBuild): string {
  return `${build.usageAssets
    .map((asset) => [
      `# Usage: ${asset.item.key}`,
      `# Category: ${asset.item.category}`,
      `# Source: ${asset.asset.fileName}`,
      `#begin ${asset.outputRelativePath}`,
      `/importer:${inferMonoGameImporter(asset.outputFileName)}`,
      `/processor:${inferMonoGameProcessor(asset.outputFileName)}`,
      `/build:${asset.outputRelativePath}`,
    ].join("\n"))
    .join("\n\n")}\n`;
}

function createReadme(build: ProjectSoundPackBuild): string {
  return `# ${build.project.name} Sound Pack

Generated by ${APP_NAME}.

## Summary

* Project: ${build.project.name}
* Engine profile: ${build.options.engineProfile}
* Usage items requested: ${build.summary.requestedUsageItems}
* Usage items included: ${build.summary.includedUsageItems}
* Files to copy: ${build.summary.filesToCopy}
* Warnings: ${build.warnings.length}
* Errors: ${build.errors.length}

## Folder Structure

\`\`\`text
${build.outputTree.join("\n")}
\`\`\`

## Usage Notes

Import or copy files from this sound pack into your game project manually. Unity, Unreal, and MonoGame project files are not modified by this export.

## Limitations

Audio files are copied as-is. No audio conversion, editing, transcoding, normalization, AI analysis, or legal license judgment is performed.
`;
}

function createCredits(build: ProjectSoundPackBuild): string {
  const rows = build.usageAssets;
  return `# Credits And License Review

This report records user-entered rights metadata only. It is not legal advice and does not infer licenses.

${rows.length ? rows.map((asset) => [
    `## ${asset.item.key} - ${asset.asset.fileName}`,
    "",
    `* Author: ${asset.rights.author || "TODO"}`,
    `* License: ${asset.rights.licenseName || "TODO"}`,
    `* Commercial use: ${asset.rights.commercialUseStatus}`,
    `* Credit required: ${asset.rights.creditRequired}`,
    `* Attribution: ${asset.rights.attributionText || "TODO"}`,
    `* Source URL: ${asset.rights.sourceUrl || "TODO"}`,
  ].join("\n")).join("\n\n") : "* TODO: Review source, license, and attribution metadata before shipping."}
`;
}

function createMissingReport(build: ProjectSoundPackBuild): string {
  const includedItemIds = new Set(build.usageAssets.filter((asset) => asset.candidate.selected).map((asset) => asset.item.id));
  const requiredMissing = build.items.filter((item) => item.required && !includedItemIds.has(item.id));
  const noCandidates = build.items.filter((item) => (build.candidatesByItemId.get(item.id) ?? []).length === 0);
  const candidatesNoSelected = build.items.filter((item) => {
    const candidates = build.candidatesByItemId.get(item.id) ?? [];
    return candidates.length > 0 && !candidates.some((candidate) => candidate.selected);
  });
  const selectedNotApproved = build.warnings.filter((issue) => issue.code === "SELECTED_NOT_APPROVED");
  return `# Missing Sounds

## Required Missing

${listUsageItems(requiredMissing)}

## No Candidates

${listUsageItems(noCandidates)}

## Candidates But No Selected Asset

${listUsageItems(candidatesNoSelected)}

## Selected But Not Approved

${selectedNotApproved.length ? selectedNotApproved.map((issue) => `* ${issue.usageKey ?? "unknown"} - ${issue.fileName ?? issue.assetId ?? ""}`).join("\n") : "* none"}
`;
}

function createValidationReport(build: ProjectSoundPackBuild): string {
  return `# Validation Report

## Errors

${build.errors.length ? build.errors.map(formatIssue).join("\n") : "* none"}

## Warnings

${build.warnings.length ? build.warnings.map(formatIssue).join("\n") : "* none"}

## Sound Board Issues

${build.boardValidationIssues.length ? build.boardValidationIssues.map(formatIssue).join("\n") : "* none"}

## Recommended Manual Checks

* Review unknown license entries manually.
* Confirm credit-required assets have attribution text.
* Confirm loop-required BGM or ambience loops cleanly in the target engine.
* Confirm generated file names and usage keys match your game audio code.
`;
}

function createUsageItemsCsv(build: ProjectSoundPackBuild): string {
  return toCsv(
    build.items.map((item) => ({
      usageKey: item.key,
      displayName: item.displayName,
      category: item.category,
      status: item.status,
      priority: item.priority,
      required: item.required,
      loopRequired: item.loopRequired,
      variantsAllowed: item.variantsAllowed,
      selectedAssetCount: build.usageAssets.filter((asset) => asset.item.id === item.id && asset.candidate.selected).length,
      assignee: item.assignee,
      dueLabel: item.dueLabel,
      workNote: build.options.includeWorkNotes ? item.workNote : "",
      reviewNote: build.options.includeReviewNotes ? item.reviewNote : "",
      decisionNote: build.options.includeDecisionNotes ? item.decisionNote : "",
    })),
  );
}

function createSelectedAssetsCsv(build: ProjectSoundPackBuild): string {
  return toCsv(
    build.usageAssets
      .filter((asset) => asset.candidate.selected)
      .map((asset) => ({
        usageKey: asset.item.key,
        assetId: asset.asset.id,
        originalFileName: asset.asset.fileName,
        outputFileName: asset.outputFileName,
        outputPath: asset.outputRelativePath,
        approved: asset.candidate.approved,
        durationMs: asset.asset.audioAnalysis?.durationMs ?? "",
        licenseName: build.options.includeRights ? asset.rights.licenseName : "",
      })),
  );
}

function createCandidatesCsv(build: ProjectSoundPackBuild): string {
  return toCsv(
    Array.from(build.candidatesByItemId.entries()).flatMap(([usageItemId, candidates]) => {
      const item = build.items.find((candidateItem) => candidateItem.id === usageItemId);
      return candidates.map((candidate) => ({
        usageKey: item?.key ?? usageItemId,
        assetId: candidate.assetId,
        fileName: candidate.asset?.fileName ?? "",
        selected: candidate.selected,
        approved: candidate.approved,
        rejected: candidate.rejected,
        rank: candidate.candidateRank,
        fitScore: candidate.fitScore ?? "",
        ratingForUsage: build.options.includeCandidateReviewNotes ? candidate.ratingForUsage ?? "" : "",
        pros: build.options.includeCandidateReviewNotes ? candidate.pros : "",
        cons: build.options.includeCandidateReviewNotes ? candidate.cons : "",
        reviewNote: build.options.includeCandidateReviewNotes ? candidate.reviewNote : "",
        decisionReason: build.options.includeDecisionNotes ? candidate.decisionReason : "",
        loudnessFit: build.options.includeCandidateReviewNotes ? candidate.loudnessFit : "",
        loopFit: build.options.includeCandidateReviewNotes ? candidate.loopFit : "",
        moodFit: build.options.includeCandidateReviewNotes ? candidate.moodFit : "",
      }));
    }),
  );
}

function createRightsCsv(build: ProjectSoundPackBuild): string {
  return toCsv(
    build.usageAssets.map((asset) => ({
      usageKey: asset.item.key,
      assetId: asset.asset.id,
      fileName: asset.asset.fileName,
      licenseName: asset.rights.licenseName,
      author: asset.rights.author,
      sourceUrl: asset.rights.sourceUrl,
      commercialUseStatus: asset.rights.commercialUseStatus,
      creditRequired: asset.rights.creditRequired,
      attributionText: asset.rights.attributionText,
    })),
  );
}

function createOutputTree(files: ProjectSoundPackPlannedFile[]): string[] {
  return unique(files.map((file) => file.relativePath).sort()).map((path) => `./${path}`);
}

function getAudioRoot(profile: ProjectSoundPackEngineProfile): string {
  switch (profile) {
    case "unity":
      return "Assets/Audio";
    case "unreal":
      return "ContentImport/Audio";
    case "monogame":
      return "Content/Audio";
    case "generic":
    default:
      return "audio";
  }
}

function categoryFolder(category: SoundUsageCategory, profile: ProjectSoundPackEngineProfile): string {
  if (profile === "generic") {
    return category === "music" ? "bgm" : category;
  }
  switch (category) {
    case "ui":
      return "UI";
    case "sfx":
      return "SFX";
    case "bgm":
    case "music":
      return "BGM";
    case "ambience":
      return "Ambience";
    case "voice":
      return "Voice";
    case "other":
    default:
      return "Other";
  }
}

function countUnknownLicense(assets: PlannedUsageAsset[]): number {
  return assets.filter((asset) => isUnknownLicense(asset.rights)).length;
}

function countCreditRequired(assets: PlannedUsageAsset[]): number {
  return assets.filter((asset) => asset.rights.creditRequired === "yes").length;
}

function isUnknownLicense(rights: AssetRightsMetadata): boolean {
  return !rights.licenseName || rights.commercialUseStatus === "unknown";
}

function licenseSummary(rights: AssetRightsMetadata): Record<string, string> {
  return {
    licenseName: rights.licenseName,
    author: rights.author,
    attributionText: rights.attributionText,
    commercialUseStatus: rights.commercialUseStatus,
    creditRequired: rights.creditRequired,
  };
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

function safeExtension(fileName: string): string {
  const ext = extname(fileName).replace(/[^.\w]/g, "").toLowerCase();
  return ext || ".wav";
}

function safeUsageKeyStem(input: string): string {
  const ascii = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96);
  return ascii || "audio";
}

function inferMonoGameImporter(fileName: string): string {
  const ext = extname(fileName).toLowerCase();
  if (ext === ".wav") {
    return "WavImporter";
  }
  if (ext === ".mp3") {
    return "Mp3Importer";
  }
  return "OggImporter";
}

function inferMonoGameProcessor(fileName: string): string {
  const ext = extname(fileName).toLowerCase();
  return ext === ".wav" ? "SoundEffectProcessor" : "SongProcessor";
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

function listUsageItems(items: SoundUsageItemRecord[]): string {
  return items.length ? items.map((item) => `* ${item.key} - ${item.displayName}`).join("\n") : "* none";
}

function formatIssue(issue: ProjectSoundPackIssue | SoundBoardValidationIssue): string {
  return `* [${issue.severity}] ${issue.usageKey ?? issue.code}: ${issue.message}`;
}

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function toPosixPath(path: string): string {
  return path.replace(/\\/g, "/");
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}
