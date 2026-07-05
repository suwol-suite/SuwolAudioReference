import type {
  SoundCandidateReviewInput,
  SoundUsageCandidateRecord,
  SoundUsageItemRecord,
  SoundUsageWorkflowUpdateInput,
  SoundWorkTodoColumn,
  SoundWorkTodoItem,
  SoundWorkTodoQuery,
  SoundWorkTodoSummary,
} from "../../shared/sound-board-types";
import type { AssetService } from "./asset-service";
import type { LibraryService } from "./library-service";
import { SoundBoardValidationService } from "./sound-board-validation-service";
import { SoundCandidateService } from "./sound-candidate-service";
import { SoundUsageService } from "./sound-usage-service";

const TODO_COLUMNS: SoundWorkTodoColumn[] = [
  "missing",
  "need_candidates",
  "reviewing",
  "selected",
  "approved",
  "deferred",
  "risk",
];

export class SoundWorkflowService {
  private readonly usageService: SoundUsageService;
  private readonly validationService: SoundBoardValidationService;

  constructor(
    private readonly libraryService: LibraryService,
    private readonly assetService: AssetService,
    private readonly candidateService: SoundCandidateService,
  ) {
    this.usageService = new SoundUsageService(libraryService, assetService);
    this.validationService = new SoundBoardValidationService(libraryService, assetService, candidateService);
  }

  async getTodoSummary(projectId: string): Promise<SoundWorkTodoSummary> {
    const items = await this.listTodoItems({ projectId, column: "all" });
    const columns = createEmptyColumnCounts();
    for (const entry of items) {
      columns[entry.column] += 1;
      if (entry.riskCount > 0) {
        columns.risk += 1;
      }
    }
    return {
      projectId,
      total: items.length,
      risks: columns.risk,
      columns,
    };
  }

  async listTodoItems(query: SoundWorkTodoQuery): Promise<SoundWorkTodoItem[]> {
    const [items, validation] = await Promise.all([
      this.usageService.listItems({
        projectId: query.projectId,
        search: query.search,
        sort: query.sort === "updatedWorkflow" ? "updatedWorkflow" : "priority",
      }),
      this.validationService.validateBoard(query.projectId),
    ]);
    const issuesByItemId = new Map<string, typeof validation.issues>();
    for (const issue of validation.issues) {
      if (!issue.usageItemId) {
        continue;
      }
      issuesByItemId.set(issue.usageItemId, [...(issuesByItemId.get(issue.usageItemId) ?? []), issue]);
    }

    const assignee = query.assignee?.trim().toLowerCase();
    const dueLabel = query.dueLabel?.trim().toLowerCase();
    const entries = items
      .filter((item) => !assignee || item.assignee.toLowerCase().includes(assignee))
      .filter((item) => !dueLabel || item.dueLabel.toLowerCase().includes(dueLabel))
      .map((item): SoundWorkTodoItem => {
        const riskIssues = (issuesByItemId.get(item.id) ?? []).filter((issue) => issue.severity !== "info");
        return {
          item,
          column: inferTodoColumn(item),
          riskCount: riskIssues.length,
          riskCodes: Array.from(new Set(riskIssues.map((issue) => issue.code))),
          selectedAssetName: item.selectedAsset?.title || item.selectedAsset?.fileName || "",
        };
      })
      .filter((entry) => {
        if (!query.column || query.column === "all") {
          return true;
        }
        if (query.column === "risk") {
          return entry.riskCount > 0;
        }
        return entry.column === query.column;
      });
    return sortTodoItems(entries, query.sort);
  }

  updateUsageWorkflow(usageItemId: string, input: SoundUsageWorkflowUpdateInput): Promise<SoundUsageItemRecord> {
    return this.usageService.updateItem(usageItemId, input);
  }

  updateCandidateReview(candidateId: string, input: SoundCandidateReviewInput): Promise<SoundUsageCandidateRecord> {
    return this.candidateService.updateCandidate(candidateId, input);
  }
}

function createEmptyColumnCounts(): Record<SoundWorkTodoColumn, number> {
  return TODO_COLUMNS.reduce(
    (counts, column) => ({ ...counts, [column]: 0 }),
    {} as Record<SoundWorkTodoColumn, number>,
  );
}

function inferTodoColumn(item: SoundUsageItemRecord): SoundWorkTodoColumn {
  if (item.status === "approved") {
    return "approved";
  }
  if (item.status === "deferred") {
    return "deferred";
  }
  if (item.status === "selected") {
    return "selected";
  }
  if (item.status === "reviewing") {
    return "reviewing";
  }
  if (item.status === "needs_candidates" || item.candidateCount === 0) {
    return "need_candidates";
  }
  return "missing";
}

function sortTodoItems(items: SoundWorkTodoItem[], sort: SoundWorkTodoQuery["sort"]): SoundWorkTodoItem[] {
  const sorted = [...items];
  switch (sort) {
    case "status":
      return sorted.sort((left, right) => left.item.status.localeCompare(right.item.status) || left.item.key.localeCompare(right.item.key));
    case "riskCount":
      return sorted.sort((left, right) => right.riskCount - left.riskCount || left.item.key.localeCompare(right.item.key));
    case "category":
      return sorted.sort((left, right) => left.item.category.localeCompare(right.item.category) || left.item.key.localeCompare(right.item.key));
    case "updatedWorkflow":
      return sorted.sort((left, right) =>
        (right.item.updatedWorkflowAt ?? right.item.updatedAt).localeCompare(left.item.updatedWorkflowAt ?? left.item.updatedAt),
      );
    case "key":
      return sorted.sort((left, right) => left.item.key.localeCompare(right.item.key));
    case "priority":
    default:
      return sorted.sort(
        (left, right) =>
          priorityRank(left.item.priority) - priorityRank(right.item.priority) ||
          right.riskCount - left.riskCount ||
          left.item.key.localeCompare(right.item.key),
      );
  }
}

function priorityRank(priority: SoundUsageItemRecord["priority"]): number {
  switch (priority) {
    case "critical":
      return 0;
    case "high":
      return 1;
    case "normal":
      return 2;
    case "low":
    default:
      return 3;
  }
}
