import { access, mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import type {
  SoundChangeReviewDetail,
  SoundChangeReviewExportFormat,
  SoundChangeReviewExportOptions,
  SoundChangeReviewExportPreview,
  SoundChangeReviewExportResult,
  SoundChangeReviewItemRecord,
} from "../../shared/sound-board-types";
import { toCsv } from "./game-audio-manifest-service";
import type { SoundChangeReviewService } from "./sound-change-review-service";

export class SoundChangeReviewExportService {
  constructor(private readonly reviewService: SoundChangeReviewService) {}

  preview(input: SoundChangeReviewExportOptions): SoundChangeReviewExportPreview {
    const format = input.format ?? "markdown";
    const review = this.reviewService.get(input.reviewId);
    if (!review) {
      throw new Error("CHANGE_REVIEW_LOAD_FAILED");
    }
    const items = filterItems(review.items, input);
    return {
      ok: true,
      reviewId: review.id,
      projectId: review.projectId,
      format,
      fileName: fileNameForFormat(format),
      itemCount: items.length,
      summary: review.summary,
      previewText: renderReview(review, items, format, input),
    };
  }

  async export(input: SoundChangeReviewExportOptions, outputDirectory: string): Promise<SoundChangeReviewExportResult> {
    try {
      const preview = this.preview(input);
      await mkdir(outputDirectory, { recursive: true });
      const outputPath = await writeUniqueTextFile(outputDirectory, preview.fileName, preview.previewText);
      return {
        ...preview,
        outputPath,
        files: [outputPath],
      };
    } catch (error) {
      return {
        ok: false,
        reviewId: input.reviewId,
        projectId: "",
        format: input.format ?? "markdown",
        fileName: fileNameForFormat(input.format ?? "markdown"),
        itemCount: 0,
        summary: {
          totalChanges: 0,
          pending: 0,
          approved: 0,
          rejected: 0,
          deferred: 0,
          breaking: 0,
          warnings: 0,
          info: 0,
          newRisks: 0,
          resolvedRisks: 0,
          selectedChanged: 0,
          rightsChanged: 0,
        },
        previewText: "",
        files: [],
        error: { code: "CHANGE_REVIEW_EXPORT_FAILED", message: error instanceof Error ? error.message : String(error) },
      };
    }
  }
}

function filterItems(items: SoundChangeReviewItemRecord[], options: SoundChangeReviewExportOptions): SoundChangeReviewItemRecord[] {
  return items.filter((item) => {
    if (item.status === "pending" && options.includePending === false) {
      return false;
    }
    if (item.status === "approved" && options.includeApproved === false) {
      return false;
    }
    if (item.status === "rejected" && options.includeRejected === false) {
      return false;
    }
    if (item.status === "deferred" && options.includeDeferred === false) {
      return false;
    }
    if (item.changeType === "risk_changed" && options.includeRiskChanges === false) {
      return false;
    }
    if (item.changeType === "rights_changed" && options.includeRightsChanges === false) {
      return false;
    }
    return true;
  });
}

function renderReview(
  review: SoundChangeReviewDetail,
  items: SoundChangeReviewItemRecord[],
  format: SoundChangeReviewExportFormat,
  options: SoundChangeReviewExportOptions,
): string {
  if (format === "json") {
    return `${JSON.stringify({ review: { ...review, items }, options: sanitizeOptions(options) }, null, 2)}\n`;
  }
  if (format === "csv") {
    return toCsv(items.map((item) => createCsvRow(item, options)));
  }
  return renderMarkdown(review, items, options);
}

function renderMarkdown(
  review: SoundChangeReviewDetail,
  items: SoundChangeReviewItemRecord[],
  options: SoundChangeReviewExportOptions,
): string {
  const sections = [
    "# Sound Change Review Report",
    "",
    `Review: ${review.name}`,
    `Status: ${review.status}`,
    `Created: ${review.createdAt}`,
    "",
    "Review approval does not modify audio mappings.",
    "",
    "## Summary",
    "",
    `- Total changes: ${review.summary.totalChanges}`,
    `- Pending: ${review.summary.pending}`,
    `- Approved: ${review.summary.approved}`,
    `- Rejected: ${review.summary.rejected}`,
    `- Deferred: ${review.summary.deferred}`,
    `- Breaking: ${review.summary.breaking}`,
    `- Warnings: ${review.summary.warnings}`,
    `- Rights changes: ${review.summary.rightsChanged}`,
    `- Selected asset changes: ${review.summary.selectedChanged}`,
    "",
  ];
  for (const [title, status] of [
    ["Approved Changes", "approved"],
    ["Rejected Changes", "rejected"],
    ["Deferred Changes", "deferred"],
    ["Pending Changes", "pending"],
  ] as const) {
    const sectionItems = items.filter((item) => item.status === status);
    sections.push(`## ${title}`, "");
    sections.push(sectionItems.length ? sectionItems.map((item) => renderMarkdownItem(item, options)).join("\n\n") : "* none");
    sections.push("");
  }
  return `${sections.join("\n")}\n`;
}

function renderMarkdownItem(item: SoundChangeReviewItemRecord, options: SoundChangeReviewExportOptions): string {
  const lines = [
    `### ${item.usageKey}`,
    `- Type: ${item.changeType}`,
    `- Severity: ${item.severity}`,
    `- Message: ${item.message}`,
  ];
  if (options.includeReviewerNotes !== false && item.reviewerNote) {
    lines.push(`- Reviewer note: ${item.reviewerNote}`);
  }
  if (options.includeDecisionReasons !== false && item.decisionReason) {
    lines.push(`- Decision: ${item.decisionReason}`);
  }
  if (options.includeBeforeAfterDetails) {
    lines.push(`- Before: ${stringifyCell(item.before)}`);
    lines.push(`- After: ${stringifyCell(item.after)}`);
  }
  return lines.join("\n");
}

function createCsvRow(item: SoundChangeReviewItemRecord, options: SoundChangeReviewExportOptions): Record<string, string> {
  return {
    usageKey: item.usageKey,
    changeType: item.changeType,
    severity: item.severity,
    status: item.status,
    field: item.field,
    assetId: item.assetId ?? "",
    message: item.message,
    reviewerNote: options.includeReviewerNotes === false ? "" : item.reviewerNote,
    decisionReason: options.includeDecisionReasons === false ? "" : item.decisionReason,
    before: options.includeBeforeAfterDetails ? stringifyCell(item.before) : "",
    after: options.includeBeforeAfterDetails ? stringifyCell(item.after) : "",
  };
}

function fileNameForFormat(format: SoundChangeReviewExportFormat): string {
  if (format === "json") {
    return "sound-change-review.json";
  }
  if (format === "csv") {
    return "sound-change-review.csv";
  }
  return "sound-change-review.md";
}

function sanitizeOptions(options: SoundChangeReviewExportOptions): SoundChangeReviewExportOptions {
  return { ...options, includeAbsolutePaths: Boolean(options.includeAbsolutePaths) };
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
