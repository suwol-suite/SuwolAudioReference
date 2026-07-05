import { access, mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import type {
  SoundPackChangelogFormat,
  SoundPackChangelogOptions,
  SoundPackChangelogPreview,
  SoundPackChangelogResult,
  SoundPackDiffChange,
  SoundPackDiffResult,
  SoundPackDiffSummary,
} from "../../shared/sound-board-types";
import { toCsv } from "./game-audio-manifest-service";
import type { SoundChangeReviewService } from "./sound-change-review-service";
import type { SoundPackDiffService } from "./sound-pack-diff-service";

type ReviewAnnotatedChange = SoundPackDiffChange & {
  reviewDecision?: {
    status: string;
    reviewerNote: string;
    decisionReason: string;
  };
};

export class SoundPackChangelogService {
  constructor(
    private readonly diffService: SoundPackDiffService,
    private readonly reviewService?: SoundChangeReviewService,
  ) {}

  async preview(input: SoundPackChangelogOptions): Promise<SoundPackChangelogPreview> {
    const format = input.format ?? "markdown";
    const diff = await this.diffService.compare(input);
    const filtered = this.filterDiff(diff, input);
    return {
      projectId: diff.projectId,
      format,
      fileName: fileNameForFormat(format),
      diff: filtered,
      previewText: renderChangelog(filtered, format, input),
    };
  }

  async export(input: SoundPackChangelogOptions, outputDirectory: string): Promise<SoundPackChangelogResult> {
    try {
      const preview = await this.preview(input);
      await mkdir(outputDirectory, { recursive: true });
      const outputPath = await writeUniqueTextFile(outputDirectory, preview.fileName, preview.previewText);
      return {
        ...preview,
        ok: true,
        outputPath,
        files: [outputPath],
      };
    } catch (error) {
      const format = input.format ?? "markdown";
      const fallback = emptyDiff(input.fromSnapshotId);
      return {
        projectId: input.projectId ?? "",
        format,
        fileName: fileNameForFormat(format),
        diff: fallback,
        previewText: "",
        ok: false,
        files: [],
        error: { code: "CHANGELOG_EXPORT_FAILED", message: error instanceof Error ? error.message : String(error) },
      };
    }
  }
  private filterDiff(diff: SoundPackDiffResult, options: SoundPackChangelogOptions): SoundPackDiffResult {
    const decisions = options.reviewId && this.reviewService ? this.reviewService.createDecisionMap(options.reviewId) : new Map();
    const changes = diff.changes
      .map((change): ReviewAnnotatedChange | null => {
        if (options.includeCandidateChanges === false && (change.type === "candidate_added" || change.type === "candidate_removed")) {
          return null;
        }
        if (options.includeRightsChanges === false && change.type === "rights_changed") {
          return null;
        }
        if (options.includeRiskChanges === false && change.type === "risk_changed") {
          return null;
        }
        const decision = this.reviewService ? decisions.get(this.reviewService.decisionKeyForChange(change)) : undefined;
        if (options.approvedChangesOnly && decision?.status !== "approved") {
          return null;
        }
        if (options.excludeRejectedChanges && decision?.status === "rejected") {
          return null;
        }
        if (options.includeDeferredChanges === false && decision?.status === "deferred") {
          return null;
        }
        return options.includeReviewDecisions && decision
          ? {
              ...change,
              reviewDecision: {
                status: decision.status,
                reviewerNote: decision.reviewerNote,
                decisionReason: decision.decisionReason,
              },
            }
          : change;
      })
      .filter((change): change is ReviewAnnotatedChange => Boolean(change));
    return { ...diff, summary: summarizeFilteredChanges(changes), changes };
  }
}

function renderChangelog(diff: SoundPackDiffResult, format: SoundPackChangelogFormat, options: SoundPackChangelogOptions): string {
  if (format === "json") {
    return `${JSON.stringify(diff, null, 2)}\n`;
  }
  if (format === "csv") {
    return toCsv(
      (diff.changes as ReviewAnnotatedChange[]).map((change) => ({
        severity: change.severity,
        type: change.type,
        usageKey: change.usageKey,
        field: change.field ?? "",
        assetId: change.assetId ?? "",
        before: stringifyCell(change.before),
        after: stringifyCell(change.after),
        message: change.message,
        reviewStatus: options.includeReviewDecisions ? change.reviewDecision?.status ?? "" : "",
        reviewerNote: options.includeReviewDecisions ? change.reviewDecision?.reviewerNote ?? "" : "",
        decisionReason: options.includeReviewDecisions ? change.reviewDecision?.decisionReason ?? "" : "",
      })),
    );
  }
  return [
    "# Sound Pack Changelog",
    "",
    `From: ${diff.fromName}`,
    `To: ${diff.toName}`,
    "",
    "## Summary",
    "",
    `- Added usage items: ${diff.summary.addedUsageItems}`,
    `- Removed usage items: ${diff.summary.removedUsageItems}`,
    `- Changed usage items: ${diff.summary.changedUsageItems}`,
    `- Selection changes: ${diff.summary.selectionChanges}`,
    `- Approval changes: ${diff.summary.approvalChanges}`,
    `- Candidate changes: ${diff.summary.candidateChanges}`,
    `- Rights changes: ${diff.summary.rightsChanges}`,
    `- Risk changes: ${diff.summary.riskChanges}`,
    `- Breaking changes: ${diff.summary.breakingChanges}`,
    "",
    "## Changes",
    "",
    ...(diff.changes.length === 0
      ? ["No sound pack changes detected."]
      : (diff.changes as ReviewAnnotatedChange[]).map((change) => {
          const base = `- [${change.severity}] ${change.type} / ${change.message}`;
          if (!options.includeReviewDecisions || !change.reviewDecision) {
            return base;
          }
          const decision = change.reviewDecision.decisionReason ? ` - Decision: ${change.reviewDecision.decisionReason}` : "";
          return `${base} - Review: ${change.reviewDecision.status}${decision}`;
        })),
    "",
  ].join("\n");
}

function summarizeFilteredChanges(changes: SoundPackDiffChange[]): SoundPackDiffSummary {
  return {
    addedUsageItems: changes.filter((change) => change.type === "usage_added").length,
    removedUsageItems: changes.filter((change) => change.type === "usage_removed").length,
    changedUsageItems: new Set(changes.filter((change) => change.type === "usage_changed").map((change) => change.usageKey)).size,
    selectionChanges: changes.filter((change) => change.type === "selection_changed").length,
    approvalChanges: changes.filter((change) => change.type === "approval_changed").length,
    candidateChanges: changes.filter((change) => change.type === "candidate_added" || change.type === "candidate_removed").length,
    assetChanges: changes.filter((change) => change.type === "asset_changed").length,
    rightsChanges: changes.filter((change) => change.type === "rights_changed").length,
    riskChanges: changes.filter((change) => change.type === "risk_changed").length,
    breakingChanges: changes.filter((change) => change.severity === "breaking").length,
    warnings: changes.filter((change) => change.severity === "warning").length,
  };
}

function fileNameForFormat(format: SoundPackChangelogFormat): string {
  if (format === "json") {
    return "sound-pack-changelog.json";
  }
  if (format === "csv") {
    return "sound-pack-changelog.csv";
  }
  return "sound-pack-changelog.md";
}

function stringifyCell(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  return typeof value === "string" ? value : JSON.stringify(value);
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

function emptyDiff(fromSnapshotId: string): SoundPackDiffResult {
  return {
    projectId: "",
    fromSnapshotId,
    toSnapshotId: null,
    toCurrent: false,
    fromName: "",
    toName: "",
    summary: {
      addedUsageItems: 0,
      removedUsageItems: 0,
      changedUsageItems: 0,
      selectionChanges: 0,
      approvalChanges: 0,
      candidateChanges: 0,
      assetChanges: 0,
      rightsChanges: 0,
      riskChanges: 0,
      breakingChanges: 0,
      warnings: 0,
    },
    changes: [],
  };
}
