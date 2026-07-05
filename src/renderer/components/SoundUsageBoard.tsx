import {
  Archive,
  Check,
  ClipboardList,
  ClipboardPaste,
  FileOutput,
  GitCompareArrows,
  Play,
  Plus,
  Search,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ExportOptions, ExportTargetType } from "../../shared/export-types";
import type { AssetListItem } from "../../shared/library-types";
import type {
  GameEngineType,
  GameProjectRecord,
  ProjectDefaultExportFormat,
  SoundBoardExportFormat,
  SoundBoardSummary,
  SoundBoardValidationResult,
  SoundCandidateSuggestion,
  SoundProjectChecklistItemUpdateInput,
  SoundProjectChecklistListResult,
  SoundProjectStyleGuideInput,
  SoundProjectStyleGuideRecord,
  SoundUsageCandidateRecord,
  SoundUsageCategory,
  SoundUsageItemRecord,
  SoundUsagePriority,
  SoundUsageRiskFilter,
  SoundUsageSortOption,
  SoundUsageStatus,
  SoundUsageTemplate,
  SoundWorkTodoColumn,
  SoundWorkTodoItem,
  SoundWorkTodoSummary,
} from "../../shared/sound-board-types";
import type { MessageKey } from "../i18n/i18n";
import { useI18n } from "../i18n/useI18n";
import { BulkUsageImportDialog } from "./BulkUsageImportDialog";
import { ProjectChecklistPanel } from "./ProjectChecklistPanel";
import { ProjectStyleGuidePanel } from "./ProjectStyleGuidePanel";
import { SoundBoardDashboard } from "./SoundBoardDashboard";
import { SoundBoardValidationPanel } from "./SoundBoardValidationPanel";
import { SoundWorkTodoBoard } from "./SoundWorkTodoBoard";
import { EmptyState } from "./ui/EmptyState";

interface SoundUsageBoardDialogProps {
  open: boolean;
  selectedAssetId: string | null;
  selectedAssetIds: string[];
  onClose: () => void;
  onPlayAsset: (assetId: string) => Promise<void> | void;
  onCompareAssets: (assetIds: string[]) => Promise<void> | void;
  onOpenExportCenter: (initialOptions: Partial<ExportOptions>) => void;
}

const ENGINE_OPTIONS: GameEngineType[] = ["generic", "unity", "unreal", "monogame"];
const EXPORT_OPTIONS: SoundBoardExportFormat[] = [
  "generic_manifest",
  "unity_manifest",
  "unreal_manifest",
  "monogame_manifest",
  "codex_instruction",
  "sound_pack",
  "missing_report",
];
const DEFAULT_EXPORT_OPTIONS: ProjectDefaultExportFormat[] = [
  "generic_manifest",
  "unity_manifest",
  "unreal_manifest",
  "monogame_manifest",
  "codex_instruction",
  "sound_pack",
];
const STATUS_OPTIONS: Array<SoundUsageStatus | "all"> = [
  "all",
  "missing",
  "needs_candidates",
  "reviewing",
  "selected",
  "approved",
  "rejected",
  "deferred",
];
const CATEGORY_OPTIONS: Array<SoundUsageCategory | "all"> = ["all", "ui", "sfx", "bgm", "ambience", "voice", "music", "other"];
const PRIORITY_OPTIONS: SoundUsagePriority[] = ["low", "normal", "high", "critical"];
const RISK_FILTER_OPTIONS: SoundUsageRiskFilter[] = [
  "all",
  "required",
  "critical",
  "loop_required",
  "recently_updated",
  "missing_required",
  "no_candidates",
  "candidates_no_selected",
  "selected_not_approved",
  "approved",
  "deferred",
  "rejected",
  "has_risks",
  "unknown_license_selected",
  "loop_mismatch",
  "playback_unsupported_selected",
  "missing_file_selected",
];
const SORT_OPTIONS: SoundUsageSortOption[] = [
  "priority",
  "requiredFirst",
  "status",
  "category",
  "candidateCount",
  "updatedDesc",
  "updatedWorkflow",
  "key",
  "riskCount",
];

export function SoundUsageBoardDialog({
  open,
  selectedAssetId,
  selectedAssetIds,
  onClose,
  onPlayAsset,
  onCompareAssets,
  onOpenExportCenter,
}: SoundUsageBoardDialogProps): JSX.Element | null {
  const { t, format } = useI18n();
  const [projects, setProjects] = useState<GameProjectRecord[]>([]);
  const [templates, setTemplates] = useState<SoundUsageTemplate[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [items, setItems] = useState<SoundUsageItemRecord[]>([]);
  const [summary, setSummary] = useState<SoundBoardSummary | null>(null);
  const [validation, setValidation] = useState<SoundBoardValidationResult | null>(null);
  const [todoSummary, setTodoSummary] = useState<SoundWorkTodoSummary | null>(null);
  const [todoItems, setTodoItems] = useState<SoundWorkTodoItem[]>([]);
  const [todoColumn, setTodoColumn] = useState<SoundWorkTodoColumn | "all">("all");
  const [todoAssigneeFilter, setTodoAssigneeFilter] = useState("");
  const [todoDueFilter, setTodoDueFilter] = useState("");
  const [styleGuide, setStyleGuide] = useState<SoundProjectStyleGuideRecord | null>(null);
  const [checklist, setChecklist] = useState<SoundProjectChecklistListResult | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<SoundUsageCandidateRecord[]>([]);
  const [suggestions, setSuggestions] = useState<SoundCandidateSuggestion[]>([]);
  const [assetSearch, setAssetSearch] = useState("");
  const [assetResults, setAssetResults] = useState<AssetListItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<SoundUsageStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<SoundUsageCategory | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<SoundUsagePriority | "all">("all");
  const [riskFilter, setRiskFilter] = useState<SoundUsageRiskFilter>("all");
  const [sort, setSort] = useState<SoundUsageSortOption>("priority");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<SoundBoardExportFormat>("generic_manifest");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;
  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null;
  const selectedCandidate = candidates.find((candidate) => candidate.selected && candidate.asset) ?? null;
  const validationByItemId = useMemo(() => {
    const map = new Map<string, SoundBoardValidationResult["issues"]>();
    for (const issue of validation?.issues ?? []) {
      if (!issue.usageItemId) {
        continue;
      }
      map.set(issue.usageItemId, [...(map.get(issue.usageItemId) ?? []), issue]);
    }
    return map;
  }, [validation]);

  useEffect(() => {
    if (!open) {
      return;
    }
    void refreshProjects();
    void refreshTemplates();
  }, [open]);

  useEffect(() => {
    if (!open || !activeProjectId) {
      return;
    }
    void refreshBoard(activeProjectId);
  }, [
    open,
    activeProjectId,
    statusFilter,
    categoryFilter,
    priorityFilter,
    riskFilter,
    sort,
    debouncedSearch,
    todoColumn,
    todoAssigneeFilter,
    todoDueFilter,
  ]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search), 220);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    if (!selectedItemId) {
      setCandidates([]);
      setSuggestions([]);
      return;
    }
    void refreshCandidates(selectedItemId);
  }, [selectedItemId]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const timeout = window.setTimeout(() => {
      void searchAssets();
    }, 220);
    return () => window.clearTimeout(timeout);
  }, [assetSearch, open]);

  const filteredTemplates = useMemo(() => templates.filter((template) => template.id !== "empty"), [templates]);

  if (!open) {
    return null;
  }

  async function runTask(task: () => Promise<void>): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      await task();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("soundBoard.errorGeneric" as MessageKey));
    } finally {
      setBusy(false);
    }
  }

  async function refreshProjects(): Promise<void> {
    const nextProjects = await window.suwolAudio.projects.list();
    setProjects(nextProjects);
    const nextActive = activeProjectId && nextProjects.some((project) => project.id === activeProjectId)
      ? activeProjectId
      : nextProjects[0]?.id ?? null;
    setActiveProjectId(nextActive);
    if (nextActive) {
      const project = nextProjects.find((item) => item.id === nextActive);
      setExportFormat(project?.defaultExportFormat ?? "generic_manifest");
    }
  }

  async function refreshTemplates(): Promise<void> {
    setTemplates(await window.suwolAudio.usageTemplates.list());
  }

  async function refreshBoard(projectId: string): Promise<void> {
    const [nextItems, nextSummary, nextValidation, nextTodoSummary, nextTodoItems, nextStyleGuide, nextChecklist] = await Promise.all([
      window.suwolAudio.usage.list({
        projectId,
        search: debouncedSearch,
        status: statusFilter,
        category: categoryFilter,
        priority: priorityFilter,
        riskFilter,
        sort,
      }),
      window.suwolAudio.usage.getSummary(projectId),
      window.suwolAudio.usage.validateBoard(projectId),
      window.suwolAudio.soundWorkflow.getTodoSummary(projectId),
      window.suwolAudio.soundWorkflow.listTodoItems({
        projectId,
        column: todoColumn,
        search: debouncedSearch,
        assignee: todoAssigneeFilter,
        dueLabel: todoDueFilter,
        sort: sort === "updatedWorkflow" ? "updatedWorkflow" : sort === "riskCount" ? "riskCount" : "priority",
      }),
      window.suwolAudio.soundStyleGuide.get(projectId),
      window.suwolAudio.soundChecklist.list(projectId),
    ]);
    setItems(nextItems);
    setSummary(nextSummary);
    setValidation(nextValidation);
    setTodoSummary(nextTodoSummary);
    setTodoItems(nextTodoItems);
    setStyleGuide(nextStyleGuide);
    setChecklist(nextChecklist);
    setSelectedItemId((current) => (current && nextItems.some((item) => item.id === current) ? current : nextItems[0]?.id ?? null));
  }

  async function refreshCandidates(usageItemId: string): Promise<void> {
    setCandidates(await window.suwolAudio.usageCandidates.list(usageItemId));
  }

  async function createProject(): Promise<void> {
    const name = window.prompt(t("soundBoard.projectNamePrompt" as MessageKey));
    if (!name?.trim()) {
      return;
    }
    const project = await window.suwolAudio.projects.create({ name, engineType: "generic" });
    await refreshProjects();
    setActiveProjectId(project.id);
  }

  async function updateProject(input: Partial<Pick<GameProjectRecord, "engineType" | "defaultExportFormat" | "rootNamespace">>): Promise<void> {
    if (!activeProject) {
      return;
    }
    const updated = await window.suwolAudio.projects.update(activeProject.id, input);
    setProjects((current) => current.map((project) => (project.id === updated.id ? updated : project)));
    if (input.defaultExportFormat) {
      setExportFormat(input.defaultExportFormat);
    }
  }

  async function archiveProject(): Promise<void> {
    if (!activeProject || !window.confirm(t("soundBoard.archiveProjectConfirm" as MessageKey))) {
      return;
    }
    await window.suwolAudio.projects.archive(activeProject.id);
    setSelectedItemId(null);
    await refreshProjects();
  }

  async function createUsageItem(): Promise<void> {
    if (!activeProjectId) {
      return;
    }
    const key = window.prompt(t("soundBoard.usageKeyPrompt" as MessageKey));
    if (!key?.trim()) {
      return;
    }
    const item = await window.suwolAudio.usage.create({ projectId: activeProjectId, key, displayName: key, category: "sfx" });
    await refreshBoard(activeProjectId);
    setSelectedItemId(item.id);
  }

  async function applyTemplate(templateId: string): Promise<void> {
    if (!activeProjectId) {
      return;
    }
    const preview = await window.suwolAudio.usageTemplates.previewApply({
      projectId: activeProjectId,
      templateId,
      conflictMode: "skip",
    });
    const confirmed = window.confirm(
      t("soundBoard.applyTemplatePreviewConfirm" as MessageKey, {
        create: format.number(preview.createCount),
        update: format.number(preview.updateCount),
        skip: format.number(preview.skipCount),
      }),
    );
    if (!confirmed) {
      return;
    }
    const result = await window.suwolAudio.usageTemplates.apply({
      projectId: activeProjectId,
      templateId,
      conflictMode: "skip",
    });
    setMessage(t("batch.complete" as MessageKey, {
      label: t("soundBoard.template" as MessageKey),
      success: format.number(result.success),
      failed: format.number(result.failed),
      skipped: format.number(result.skipped),
    }));
    await refreshBoard(activeProjectId);
  }

  async function saveProjectAsTemplate(): Promise<void> {
    if (!activeProjectId) {
      return;
    }
    const name = window.prompt(t("soundBoard.templateNamePrompt" as MessageKey), activeProject?.name ? `${activeProject.name} Template` : "");
    if (!name?.trim()) {
      return;
    }
    await window.suwolAudio.usageTemplates.createFromProject({ projectId: activeProjectId, name });
    await refreshTemplates();
  }

  async function deleteTemplate(templateId: string): Promise<void> {
    if (!window.confirm(t("soundBoard.deleteTemplateConfirm" as MessageKey))) {
      return;
    }
    await window.suwolAudio.usageTemplates.delete(templateId);
    await refreshTemplates();
  }

  async function renameTemplate(template: SoundUsageTemplate): Promise<void> {
    if (template.builtIn) {
      return;
    }
    const name = window.prompt(t("soundBoard.templateNamePrompt" as MessageKey), template.name);
    if (!name?.trim()) {
      return;
    }
    await window.suwolAudio.usageTemplates.rename(template.id, { name });
    await refreshTemplates();
  }

  async function addSelectedAssetsAsCandidates(): Promise<void> {
    if (!selectedItem) {
      return;
    }
    await addSelectedAssetsToUsage(selectedItem.id);
  }

  async function addSelectedAssetsToUsage(usageItemId: string): Promise<void> {
    const ids = selectedAssetIds.length > 0 ? selectedAssetIds : selectedAssetId ? [selectedAssetId] : [];
    for (const assetId of ids) {
      await window.suwolAudio.usageCandidates.add({ usageItemId, assetId, selected: ids.length === 1 });
    }
    await refreshAfterCandidateChange(usageItemId);
  }

  async function searchAssets(): Promise<void> {
    if (!assetSearch.trim()) {
      setAssetResults([]);
      return;
    }
    const page = await window.suwolAudio.assets.list({ search: assetSearch, pageSize: 12, playable: true });
    setAssetResults(page.items);
  }

  async function addCandidate(assetId: string, suggestion?: SoundCandidateSuggestion): Promise<void> {
    if (!selectedItem) {
      return;
    }
    await window.suwolAudio.usageCandidates.add({
      usageItemId: selectedItem.id,
      assetId,
      fitScore: suggestion?.score,
      fitReasons: suggestion?.reasons,
    });
    await refreshAfterCandidateChange(selectedItem.id);
  }

  async function refreshAfterCandidateChange(usageItemId: string): Promise<void> {
    await Promise.all([refreshCandidates(usageItemId), activeProjectId ? refreshBoard(activeProjectId) : Promise.resolve()]);
  }

  async function updateSelectedItemStatus(status: SoundUsageStatus): Promise<void> {
    if (!selectedItem) {
      return;
    }
    await window.suwolAudio.usage.updateStatus(selectedItem.id, { status });
    if (activeProjectId) {
      await refreshBoard(activeProjectId);
    }
  }

  async function updateWorkflowItem(
    usageItemId: string,
    input: { status?: SoundUsageStatus; priority?: SoundUsagePriority },
  ): Promise<void> {
    await window.suwolAudio.soundWorkflow.updateUsageWorkflow(usageItemId, input);
    if (activeProjectId) {
      await refreshBoard(activeProjectId);
    }
  }

  async function saveStyleGuide(input: SoundProjectStyleGuideInput): Promise<void> {
    if (!activeProjectId) {
      return;
    }
    setStyleGuide(await window.suwolAudio.soundStyleGuide.update(activeProjectId, input));
    await refreshBoard(activeProjectId);
  }

  async function addBuiltInChecklist(): Promise<void> {
    if (!activeProjectId) {
      return;
    }
    setChecklist(await window.suwolAudio.soundChecklist.addBuiltins(activeProjectId));
    await refreshBoard(activeProjectId);
  }

  async function createChecklistItem(label: string): Promise<void> {
    if (!activeProjectId) {
      return;
    }
    await window.suwolAudio.soundChecklist.create({ projectId: activeProjectId, label });
    await refreshBoard(activeProjectId);
  }

  async function updateChecklistItem(itemId: string, input: SoundProjectChecklistItemUpdateInput): Promise<void> {
    await window.suwolAudio.soundChecklist.update(itemId, input);
    if (activeProjectId) {
      setChecklist(await window.suwolAudio.soundChecklist.list(activeProjectId));
      setValidation(await window.suwolAudio.usage.validateBoard(activeProjectId));
    }
  }

  async function deleteChecklistItem(itemId: string): Promise<void> {
    await window.suwolAudio.soundChecklist.delete(itemId);
    if (activeProjectId) {
      await refreshBoard(activeProjectId);
    }
  }

  async function applySuggestedKey(usageItemId: string, suggestedKey?: string): Promise<void> {
    await window.suwolAudio.usage.applySuggestedKey(usageItemId, { suggestedKey });
    if (activeProjectId) {
      await refreshBoard(activeProjectId);
    }
  }

  async function suggestCandidates(seedAssetId?: string): Promise<void> {
    if (!selectedItem) {
      return;
    }
    setSuggestions(await window.suwolAudio.usageCandidates.findSimilarForUsage({ usageItemId: selectedItem.id, seedAssetId, limit: 10 }));
  }

  function openProjectExportCenter(formatOverride?: SoundBoardExportFormat, useCurrentFilter = false): void {
    if (!activeProjectId) {
      return;
    }
    const formatToUse = formatOverride ?? exportFormat;
    setExportFormat(formatToUse);
    onOpenExportCenter({
      target: targetForSoundBoardFormat(formatToUse),
      source: {
        type: "gameProject",
        projectId: activeProjectId,
        name: activeProject?.name,
        usageItemIds: useCurrentFilter ? items.map((item) => item.id) : undefined,
        label: useCurrentFilter
          ? t("export.source.currentSoundBoardFilter" as MessageKey, { count: items.length })
          : activeProject?.name,
      },
      engineProfile: engineForSoundBoardFormat(formatToUse, activeProject?.engineType ?? "generic"),
      filenamePolicy: "usage_key",
      approvedOnly: true,
      includeSelectedUnapproved: false,
      includeCandidates: true,
      includeRejectedCandidates: false,
      includeMissingItems: true,
      includeUsageNotes: true,
      includeMissingReport: true,
      includeValidationReport: true,
      includeRights: true,
      includeBoardSummary: true,
      includeReadme: true,
      includeCredits: true,
      includeManifest: true,
      includeStyleGuide: true,
      includeChecklist: true,
      includeWorkNotes: false,
      includeReviewNotes: false,
      includeCandidateReviewNotes: false,
      includeDecisionNotes: false,
      copyAudioFiles: true,
    });
  }

  function openProjectDocumentExportCenter(target: ExportTargetType): void {
    if (!activeProjectId) {
      return;
    }
    onOpenExportCenter({
      target,
      source: {
        type: "gameProject",
        projectId: activeProjectId,
        name: activeProject?.name,
      },
      includeCandidates: true,
      includeRejectedCandidates: false,
      includeMissingItems: true,
      includeStyleGuide: true,
      includeChecklist: true,
      includeWorkNotes: false,
      includeReviewNotes: false,
      includeCandidateReviewNotes: false,
      includeDecisionNotes: false,
      includeRights: true,
      includeBoardSummary: true,
      includeValidationReport: true,
    });
  }

  return (
    <div className="settings-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="settings-dialog sound-board-dialog" role="dialog" aria-modal="true" aria-label={t("soundBoard.title" as MessageKey)} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <h2>
            <ClipboardList size={18} aria-hidden="true" />
            {t("soundBoard.title" as MessageKey)}
          </h2>
          <button className="icon-button" type="button" onClick={onClose} title={t("common.close")} aria-label={t("common.close")}>
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="sound-board-layout">
          <aside className="sound-project-panel">
            <div className="sound-panel-header">
              <h3>{t("soundBoard.projects" as MessageKey)}</h3>
              <button className="icon-button" type="button" onClick={() => void runTask(createProject)} title={t("common.create")} aria-label={t("common.create")}>
                <Plus size={15} aria-hidden="true" />
              </button>
            </div>
            {projects.length === 0 ? <EmptyState title={t("soundBoard.noProjects" as MessageKey)} /> : null}
            <div className="sound-project-list">
              {projects.map((project) => (
                <button
                  key={project.id}
                  className={project.id === activeProjectId ? "is-selected" : ""}
                  type="button"
                  onClick={() => {
                    setActiveProjectId(project.id);
                    setExportFormat(project.defaultExportFormat);
                  }}
                >
                  <strong>{project.name}</strong>
                  <span>{t(`soundBoard.engine.${project.engineType}` as MessageKey)}</span>
                </button>
              ))}
            </div>
            {activeProject ? (
              <div className="sound-project-settings">
                <label>
                  {t("soundBoard.engine" as MessageKey)}
                  <select value={activeProject.engineType} onChange={(event) => void runTask(() => updateProject({ engineType: event.target.value as GameEngineType }))}>
                    {ENGINE_OPTIONS.map((engine) => (
                      <option key={engine} value={engine}>{t(`soundBoard.engine.${engine}` as MessageKey)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("soundBoard.namespace" as MessageKey)}
                  <input value={activeProject.rootNamespace} onChange={(event) => void updateProject({ rootNamespace: event.target.value })} />
                </label>
                <label>
                  {t("soundBoard.defaultExport" as MessageKey)}
                  <select value={activeProject.defaultExportFormat} onChange={(event) => void runTask(() => updateProject({ defaultExportFormat: event.target.value as ProjectDefaultExportFormat }))}>
                    {DEFAULT_EXPORT_OPTIONS.map((formatOption) => (
                      <option key={formatOption} value={formatOption}>{t(`soundBoard.export.${formatOption}` as MessageKey)}</option>
                    ))}
                  </select>
                </label>
                <button className="danger-button compact" type="button" onClick={() => void runTask(archiveProject)}>
                  <Archive size={14} aria-hidden="true" />
                  {t("soundBoard.archiveProject" as MessageKey)}
                </button>
              </div>
            ) : null}
          </aside>

          <main className="sound-usage-panel">
            <SoundBoardDashboard
              validation={validation}
              activeFilter={riskFilter}
              onFilter={setRiskFilter}
              onClearFilter={() => setRiskFilter("all")}
            />
            <SoundWorkTodoBoard
              summary={todoSummary}
              items={todoItems}
              activeColumn={todoColumn}
              assigneeFilter={todoAssigneeFilter}
              dueFilter={todoDueFilter}
              disabled={busy}
              onColumnChange={setTodoColumn}
              onAssigneeFilterChange={setTodoAssigneeFilter}
              onDueFilterChange={setTodoDueFilter}
              onSelectItem={setSelectedItemId}
              onStatusChange={(usageItemId, status) => void runTask(() => updateWorkflowItem(usageItemId, { status }))}
              onPriorityChange={(usageItemId, priority) => void runTask(() => updateWorkflowItem(usageItemId, { priority }))}
              onAddCandidate={(usageItemId) => {
                setSelectedItemId(usageItemId);
                void runTask(() => addSelectedAssetsToUsage(usageItemId));
              }}
            />
            <div className="sound-board-toolbar">
              <label className="search-box sound-board-search">
                <Search size={16} aria-hidden="true" />
                <input value={search} placeholder={t("soundBoard.searchUsage" as MessageKey)} onChange={(event) => setSearch(event.target.value)} />
              </label>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as SoundUsageStatus | "all")}>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>{status === "all" ? t("common.all" as MessageKey) : t(`soundBoard.status.${status}` as MessageKey)}</option>
                ))}
              </select>
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as SoundUsageCategory | "all")}>
                {CATEGORY_OPTIONS.map((category) => (
                  <option key={category} value={category}>{category === "all" ? t("common.all" as MessageKey) : t(`soundBoard.category.${category}` as MessageKey)}</option>
                ))}
              </select>
              <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as SoundUsagePriority | "all")}>
                <option value="all">{t("common.all" as MessageKey)}</option>
                {PRIORITY_OPTIONS.map((priority) => (
                  <option key={priority} value={priority}>{t(`soundBoard.priority.${priority}` as MessageKey)}</option>
                ))}
              </select>
              <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value as SoundUsageRiskFilter)} aria-label={t("soundBoard.riskFilter" as MessageKey)}>
                {RISK_FILTER_OPTIONS.map((filter) => (
                  <option key={filter} value={filter}>{t(`soundBoard.filter.${filter}` as MessageKey)}</option>
                ))}
              </select>
              <select value={sort} onChange={(event) => setSort(event.target.value as SoundUsageSortOption)} aria-label={t("sort.title")}>
                {SORT_OPTIONS.map((option) => (
                  <option key={option} value={option}>{t(`soundBoard.sort.${option}` as MessageKey)}</option>
                ))}
              </select>
              <button className="secondary-button compact" type="button" disabled={!activeProjectId || busy} onClick={() => setBulkImportOpen(true)}>
                <ClipboardPaste size={15} aria-hidden="true" />
                {t("soundBoard.bulkAdd" as MessageKey)}
              </button>
              <button className="primary-button compact" type="button" disabled={!activeProjectId || busy} onClick={() => void runTask(createUsageItem)}>
                <Plus size={15} aria-hidden="true" />
                {t("soundBoard.addUsage" as MessageKey)}
              </button>
            </div>

            {summary ? (
              <div className="sound-summary-row">
                <span>{t("soundBoard.summary.total" as MessageKey, { count: format.number(summary.total) })}</span>
                <span>{t("soundBoard.summary.requiredMissing" as MessageKey, { count: format.number(summary.requiredMissing) })}</span>
                <span>{t("soundBoard.summary.selected" as MessageKey, { count: format.number(summary.selected) })}</span>
                <span>{t("soundBoard.summary.noCandidates" as MessageKey, { count: format.number(summary.noCandidates) })}</span>
              </div>
            ) : null}

            <div className="template-row">
              {filteredTemplates.map((template) => (
                <span key={template.id} className={template.builtIn ? "template-chip" : "template-chip is-custom"}>
                  <button className="secondary-button compact" type="button" disabled={!activeProjectId || busy} onClick={() => void runTask(() => applyTemplate(template.id))}>
                    {template.name}
                    <small>{template.items.length} / {template.builtIn ? t("soundBoard.templateBuiltIn" as MessageKey) : t("soundBoard.templateCustom" as MessageKey)}</small>
                  </button>
                  {!template.builtIn ? (
                    <>
                      <button className="mini-icon-button" type="button" onClick={() => void runTask(() => renameTemplate(template))} title={t("management.rename" as MessageKey)} aria-label={t("management.rename" as MessageKey)}>
                        {t("management.rename" as MessageKey)}
                      </button>
                      <button className="mini-icon-button" type="button" onClick={() => void runTask(() => deleteTemplate(template.id))} title={t("common.delete")} aria-label={t("common.delete")}>
                        <X size={12} aria-hidden="true" />
                      </button>
                    </>
                  ) : null}
                </span>
              ))}
              <button className="secondary-button compact" type="button" disabled={!activeProjectId || busy} onClick={() => void runTask(saveProjectAsTemplate)}>
                {t("soundBoard.saveAsTemplate" as MessageKey)}
              </button>
            </div>

            {!activeProjectId ? (
              <EmptyState title={t("soundBoard.createProjectFirst" as MessageKey)} />
            ) : items.length === 0 && !search && statusFilter === "all" && categoryFilter === "all" && priorityFilter === "all" && riskFilter === "all" ? (
              <EmptyState title={t("soundBoard.noUsageItems" as MessageKey)} />
            ) : items.length === 0 ? (
              <EmptyState title={t("soundBoard.noFilterResults" as MessageKey)} body={t("asset.emptyFiltered")} />
            ) : (
              <SoundUsageItemList
                items={items}
                selectedItemId={selectedItemId}
                validationByItemId={validationByItemId}
                onSelect={setSelectedItemId}
              />
            )}
          </main>

          <aside className="sound-detail-panel">
            {selectedItem ? (
              <>
                <SoundUsageItemEditor
                  item={selectedItem}
                  issues={validationByItemId.get(selectedItem.id) ?? []}
                  disabled={busy}
                  onSave={(input) => void runTask(async () => {
                    await window.suwolAudio.usage.update(selectedItem.id, input);
                    if (activeProjectId) {
                      await refreshBoard(activeProjectId);
                    }
                  })}
                  onDelete={() => void runTask(async () => {
                    await window.suwolAudio.usage.delete(selectedItem.id);
                    if (activeProjectId) {
                      await refreshBoard(activeProjectId);
                    }
                  })}
                  onStatusAction={(status) => void runTask(() => updateSelectedItemStatus(status))}
                />
                <SoundCandidatePanel
                  item={selectedItem}
                  candidates={candidates}
                  suggestions={suggestions}
                  assetSearch={assetSearch}
                  assetResults={assetResults}
                  selectedCandidate={selectedCandidate}
                  selectedAssetId={selectedAssetId}
                  selectedAssetIds={selectedAssetIds}
                  onAssetSearchChange={setAssetSearch}
                  onAddSelectedAssets={() => void runTask(addSelectedAssetsAsCandidates)}
                  onAddCandidate={(assetId, suggestion) => void runTask(() => addCandidate(assetId, suggestion))}
                  onSuggest={() => void runTask(suggestCandidates)}
                  onSuggestForAsset={(assetId) => void runTask(() => suggestCandidates(assetId))}
                  onPlayAsset={onPlayAsset}
                  onCompareAssets={onCompareAssets}
                  onCandidateChanged={(usageItemId) => void runTask(() => refreshAfterCandidateChange(usageItemId))}
                />
                <SoundBoardValidationPanel
                  validation={validation}
                  onSelectIssue={setSelectedItemId}
                  onApplySuggestedKey={(usageItemId, suggestedKey) => void runTask(() => applySuggestedKey(usageItemId, suggestedKey))}
                />
              </>
            ) : (
              <EmptyState title={t("soundBoard.selectUsage" as MessageKey)} />
            )}

            {activeProjectId ? (
              <>
                <ProjectStyleGuidePanel
                  guide={styleGuide}
                  disabled={busy}
                  onSave={(input) => void runTask(() => saveStyleGuide(input))}
                />
                <ProjectChecklistPanel
                  checklist={checklist}
                  disabled={busy}
                  onAddBuiltins={() => void runTask(addBuiltInChecklist)}
                  onCreateCustom={(label) => void runTask(() => createChecklistItem(label))}
                  onUpdate={(itemId, input) => void runTask(() => updateChecklistItem(itemId, input))}
                  onDelete={(itemId) => void runTask(() => deleteChecklistItem(itemId))}
                />
              </>
            ) : null}

            {activeProjectId ? (
              <section className="sound-export-panel">
                <h3>{t("soundBoard.projectExport" as MessageKey)}</h3>
                <div className="sound-export-actions">
                  <select value={exportFormat} onChange={(event) => setExportFormat(event.target.value as SoundBoardExportFormat)}>
                    {EXPORT_OPTIONS.map((formatOption) => (
                      <option key={formatOption} value={formatOption}>{t(`soundBoard.export.${formatOption}` as MessageKey)}</option>
                    ))}
                  </select>
                  <button className="secondary-button compact" type="button" onClick={() => openProjectExportCenter(undefined, true)}>
                    {t("export.currentBoardFilter")}
                  </button>
                  <button className="primary-button compact" type="button" onClick={() => openProjectExportCenter()}>
                    <FileOutput size={14} aria-hidden="true" />
                    {t("export.openCenter")}
                  </button>
                </div>
                <button className="secondary-button compact" type="button" onClick={() => openProjectExportCenter("missing_report")}>
                  {t("soundBoard.missingReport" as MessageKey)}
                </button>
                <button className="secondary-button compact" type="button" onClick={() => openProjectDocumentExportCenter("sound_request_markdown")}>
                  {t("soundBoard.soundRequest" as MessageKey)}
                </button>
                <button className="secondary-button compact" type="button" onClick={() => openProjectDocumentExportCenter("project_style_guide_markdown")}>
                  {t("soundBoard.style.title" as MessageKey)}
                </button>
                <button className="secondary-button compact" type="button" onClick={() => openProjectDocumentExportCenter("project_checklist_markdown")}>
                  {t("soundBoard.checklist.title" as MessageKey)}
                </button>
                <p className="muted">{t("export.projectShortcutHint")}</p>
              </section>
            ) : null}
          </aside>
        </div>
        {message ? <p className="compact-status error-text">{message}</p> : null}
      </section>
      <BulkUsageImportDialog
        open={bulkImportOpen}
        projectId={activeProjectId}
        onClose={() => setBulkImportOpen(false)}
        onDone={() => activeProjectId ? refreshBoard(activeProjectId) : Promise.resolve()}
      />
    </div>
  );
}

function SoundUsageItemList({
  items,
  selectedItemId,
  validationByItemId,
  onSelect,
}: {
  items: SoundUsageItemRecord[];
  selectedItemId: string | null;
  validationByItemId: Map<string, SoundBoardValidationResult["issues"]>;
  onSelect: (id: string) => void;
}): JSX.Element {
  const { t, format } = useI18n();
  return (
    <div className="sound-usage-list">
      <div className="sound-usage-header">
        <span>{t("soundBoard.col.key" as MessageKey)}</span>
        <span>{t("soundBoard.col.category" as MessageKey)}</span>
        <span>{t("soundBoard.col.status" as MessageKey)}</span>
        <span>{t("soundBoard.col.priority" as MessageKey)}</span>
        <span>{t("soundBoard.col.candidates" as MessageKey)}</span>
        <span>{t("soundBoard.col.selected" as MessageKey)}</span>
      </div>
      {items.map((item) => {
        const issueCount = validationByItemId.get(item.id)?.filter((issue) => issue.severity !== "info").length ?? 0;
        return (
          <button key={item.id} className={item.id === selectedItemId ? "sound-usage-row is-selected" : "sound-usage-row"} type="button" onClick={() => onSelect(item.id)}>
            <span>
              <strong>{item.key}</strong>
              <small>{item.displayName}</small>
            </span>
            <span className="status-badge">{t(`soundBoard.category.${item.category}` as MessageKey)}</span>
            <span className={`status-badge status-${item.status}`}>{t(`soundBoard.status.${item.status}` as MessageKey)}</span>
            <span className={`status-badge priority-${item.priority}`}>{t(`soundBoard.priority.${item.priority}` as MessageKey)}</span>
            <span>
              {format.number(item.candidateCount)} / {format.number(item.selectedCandidateCount)}
              <small>{[
                item.required ? t("soundBoard.requiredShort" as MessageKey) : null,
                item.loopRequired ? t("soundBoard.loopShort" as MessageKey) : null,
                issueCount ? `${t("soundBoard.risk" as MessageKey)} ${format.number(issueCount)}` : null,
              ].filter(Boolean).join(" / ")}</small>
            </span>
            <span>{item.selectedAsset?.title || item.selectedAsset?.fileName || "-"}</span>
          </button>
        );
      })}
    </div>
  );
}

function SoundUsageItemEditor({
  item,
  issues,
  disabled,
  onSave,
  onDelete,
  onStatusAction,
}: {
  item: SoundUsageItemRecord;
  issues: SoundBoardValidationResult["issues"];
  disabled: boolean;
  onSave: (input: Partial<SoundUsageItemRecord>) => void;
  onDelete: () => void;
  onStatusAction: (status: SoundUsageStatus) => void;
}): JSX.Element {
  const { t } = useI18n();
  const [draft, setDraft] = useState(item);
  const dirty =
    draft.key !== item.key ||
    draft.displayName !== item.displayName ||
    draft.category !== item.category ||
    draft.status !== item.status ||
    draft.priority !== item.priority ||
    draft.required !== item.required ||
    draft.loopRequired !== item.loopRequired ||
    draft.variantsAllowed !== item.variantsAllowed ||
    draft.targetDurationMs !== item.targetDurationMs ||
    draft.targetLoudnessNote !== item.targetLoudnessNote ||
    draft.description !== item.description ||
    draft.notes !== item.notes ||
    draft.workNote !== item.workNote ||
    draft.assignee !== item.assignee ||
    draft.dueLabel !== item.dueLabel ||
    draft.reviewNote !== item.reviewNote ||
    draft.decisionNote !== item.decisionNote;

  useEffect(() => {
    setDraft(item);
  }, [item.id]);

  return (
    <section className="sound-detail-section">
      <div className="sound-panel-header">
        <h3>{t("soundBoard.usageDetail" as MessageKey)}</h3>
        {dirty ? <span className="mini-status warn">{t("soundBoard.unsavedChanges" as MessageKey)}</span> : null}
        <button
          className="danger-button compact"
          type="button"
          onClick={() => window.confirm(t("soundBoard.deleteUsageConfirm" as MessageKey)) && onDelete()}
          disabled={disabled}
        >
          {t("common.delete")}
        </button>
      </div>
      <div className="sound-editor-grid">
        <label>
          {t("soundBoard.col.key" as MessageKey)}
          <input value={draft.key} onChange={(event) => setDraft({ ...draft, key: event.target.value })} />
        </label>
        <label>
          {t("soundBoard.displayName" as MessageKey)}
          <input value={draft.displayName} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} />
        </label>
        <label>
          {t("soundBoard.col.category" as MessageKey)}
          <select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as SoundUsageCategory })}>
            {CATEGORY_OPTIONS.filter((item) => item !== "all").map((category) => (
              <option key={category} value={category}>{t(`soundBoard.category.${category}` as MessageKey)}</option>
            ))}
          </select>
        </label>
        <label>
          {t("soundBoard.col.status" as MessageKey)}
          <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as SoundUsageStatus })}>
            {STATUS_OPTIONS.filter((item) => item !== "all").map((status) => (
              <option key={status} value={status}>{t(`soundBoard.status.${status}` as MessageKey)}</option>
            ))}
          </select>
        </label>
        <label>
          {t("soundBoard.col.priority" as MessageKey)}
          <select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as SoundUsagePriority })}>
            {PRIORITY_OPTIONS.map((priority) => (
              <option key={priority} value={priority}>{t(`soundBoard.priority.${priority}` as MessageKey)}</option>
            ))}
          </select>
        </label>
        <label>
          {t("soundBoard.targetDuration" as MessageKey)}
          <input type="number" min="0" value={draft.targetDurationMs ?? ""} onChange={(event) => setDraft({ ...draft, targetDurationMs: event.target.value ? Number(event.target.value) : null })} />
        </label>
        <label>
          {t("soundBoard.targetLoudness" as MessageKey)}
          <input value={draft.targetLoudnessNote} onChange={(event) => setDraft({ ...draft, targetLoudnessNote: event.target.value })} />
        </label>
      </div>
      <div className="sound-toggle-row">
        <label className="toggle-chip">
          <input type="checkbox" checked={draft.required} onChange={(event) => setDraft({ ...draft, required: event.target.checked })} />
          {t("soundBoard.required" as MessageKey)}
        </label>
        <label className="toggle-chip">
          <input type="checkbox" checked={draft.loopRequired} onChange={(event) => setDraft({ ...draft, loopRequired: event.target.checked })} />
          {t("soundBoard.loopRequired" as MessageKey)}
        </label>
        <label className="toggle-chip">
          <input type="checkbox" checked={draft.variantsAllowed} onChange={(event) => setDraft({ ...draft, variantsAllowed: event.target.checked })} />
          {t("soundBoard.variantsAllowed" as MessageKey)}
        </label>
      </div>
      <div className="sound-toggle-row">
        <button className="secondary-button compact" type="button" onClick={() => onStatusAction("reviewing")}>
          {t("soundBoard.action.reviewing" as MessageKey)}
        </button>
        <button className="secondary-button compact" type="button" onClick={() => onStatusAction("approved")}>
          {t("soundBoard.action.approved" as MessageKey)}
        </button>
        <button className="secondary-button compact" type="button" onClick={() => onStatusAction("deferred")}>
          {t("soundBoard.action.deferred" as MessageKey)}
        </button>
        <button className="secondary-button compact" type="button" onClick={() => onStatusAction("rejected")}>
          {t("soundBoard.action.rejected" as MessageKey)}
        </button>
      </div>
      <label>
        {t("soundBoard.description" as MessageKey)}
        <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
      </label>
      <label>
        {t("soundBoard.notes" as MessageKey)}
        <textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
      </label>
      <div className="workflow-panel">
        <div className="sound-panel-header">
          <h4>{t("soundBoard.workflow" as MessageKey)}</h4>
        </div>
        <div className="sound-editor-grid">
          <label>
            {t("soundBoard.assignee" as MessageKey)}
            <input value={draft.assignee} onChange={(event) => setDraft({ ...draft, assignee: event.target.value })} />
          </label>
          <label>
            {t("soundBoard.dueLabel" as MessageKey)}
            <input value={draft.dueLabel} onChange={(event) => setDraft({ ...draft, dueLabel: event.target.value })} />
          </label>
        </div>
        <label>
          {t("soundBoard.workNote" as MessageKey)}
          <textarea value={draft.workNote} onChange={(event) => setDraft({ ...draft, workNote: event.target.value })} />
        </label>
        <label>
          {t("soundBoard.reviewNote" as MessageKey)}
          <textarea value={draft.reviewNote} onChange={(event) => setDraft({ ...draft, reviewNote: event.target.value })} />
        </label>
        <label>
          {t("soundBoard.decisionNote" as MessageKey)}
          <textarea value={draft.decisionNote} onChange={(event) => setDraft({ ...draft, decisionNote: event.target.value })} />
        </label>
      </div>
      {issues.length > 0 ? (
        <div className="inline-warning-list">
          {issues.slice(0, 3).map((issue) => (
            <span key={issue.id} className={`status-badge issue-${issue.severity}`}>{t(`soundBoard.issue.${issue.code}` as MessageKey)}</span>
          ))}
        </div>
      ) : null}
      <button className="primary-button compact" type="button" disabled={disabled || !dirty} onClick={() => onSave({
        key: draft.key,
        displayName: draft.displayName,
        category: draft.category,
        description: draft.description,
        status: draft.status,
        priority: draft.priority,
        required: draft.required,
        loopRequired: draft.loopRequired,
        variantsAllowed: draft.variantsAllowed,
        targetDurationMs: draft.targetDurationMs,
        targetLoudnessNote: draft.targetLoudnessNote,
        notes: draft.notes,
        workNote: draft.workNote,
        assignee: draft.assignee,
        dueLabel: draft.dueLabel,
        reviewNote: draft.reviewNote,
        decisionNote: draft.decisionNote,
      })}>
        {t("common.save")}
      </button>
    </section>
  );
}

function SoundCandidatePanel({
  item,
  candidates,
  suggestions,
  assetSearch,
  assetResults,
  selectedCandidate,
  selectedAssetId,
  selectedAssetIds,
  onAssetSearchChange,
  onAddSelectedAssets,
  onAddCandidate,
  onSuggest,
  onSuggestForAsset,
  onPlayAsset,
  onCompareAssets,
  onCandidateChanged,
}: {
  item: SoundUsageItemRecord;
  candidates: SoundUsageCandidateRecord[];
  suggestions: SoundCandidateSuggestion[];
  assetSearch: string;
  assetResults: AssetListItem[];
  selectedCandidate: SoundUsageCandidateRecord | null;
  selectedAssetId: string | null;
  selectedAssetIds: string[];
  onAssetSearchChange: (value: string) => void;
  onAddSelectedAssets: () => void;
  onAddCandidate: (assetId: string, suggestion?: SoundCandidateSuggestion) => void;
  onSuggest: () => void;
  onSuggestForAsset: (assetId: string) => void;
  onPlayAsset: (assetId: string) => Promise<void> | void;
  onCompareAssets: (assetIds: string[]) => Promise<void> | void;
  onCandidateChanged: (usageItemId: string) => void;
}): JSX.Element {
  const { t, format } = useI18n();
  const selectedBrowserCount = selectedAssetIds.length || (selectedAssetId ? 1 : 0);
  const existingAssetIds = new Set(candidates.map((candidate) => candidate.assetId));
  return (
    <section className="sound-detail-section">
      <div className="sound-panel-header">
        <h3>{t("soundBoard.candidates" as MessageKey)}</h3>
        <button className="secondary-button compact" type="button" disabled={selectedBrowserCount === 0} onClick={onAddSelectedAssets}>
          <Plus size={14} aria-hidden="true" />
          {t("soundBoard.addSelectedAsset" as MessageKey)}
        </button>
      </div>
      <div className="candidate-list">
        {candidates.length === 0 ? <p className="muted">{t("soundBoard.noCandidates" as MessageKey)}</p> : null}
        {candidates.map((candidate) => {
          const asset = candidate.asset;
          const compareBase = selectedCandidate?.assetId && selectedCandidate.assetId !== candidate.assetId ? selectedCandidate.assetId : null;
          const playable = Boolean(asset?.playable && !asset.fileMissing);
          return (
            <div key={candidate.id} className={candidate.selected ? "candidate-row is-selected" : candidate.rejected ? "candidate-row is-rejected" : "candidate-row"}>
              <div>
                <strong>{asset?.title || asset?.fileName || candidate.assetId}</strong>
                <span className="candidate-metadata">
                  #{candidate.candidateRank}
                  {" / "}
                  {candidate.fitScore === null ? "-" : `${Math.round(candidate.fitScore * 100)}%`}
                  {" / "}
                  {asset ? format.duration(asset.audioAnalysis?.durationMs) : "-"}
                  {" / "}
                  {asset?.audioAnalysis?.classification[0]?.type ?? "unknown"}
                  {" / "}
                  {t("asset.rating")} {asset?.rating ?? 0}
                  {asset?.favorite ? ` / ${t("asset.favorite")}` : ""}
                  {" / loop "}
                  {asset?.audioAnalysis?.loopScore === undefined ? "-" : Math.round((asset.audioAnalysis.loopScore ?? 0) * 100)}
                  {" / RMS "}
                  {formatDb(asset?.audioAnalysis?.rmsDb)}
                  {" / Peak "}
                  {formatDb(asset?.audioAnalysis?.peakDb)}
                </span>
                <div className="candidate-badges">
                  {candidate.selected ? <span className="status-badge status-selected">{t("soundBoard.selected" as MessageKey)}</span> : null}
                  {candidate.approved ? <span className="status-badge status-approved">{t("soundBoard.approved" as MessageKey)}</span> : null}
                  {candidate.rejected ? <span className="status-badge status-rejected">{t("soundBoard.rejected" as MessageKey)}</span> : null}
                  {asset?.fileMissing ? <span className="status-badge issue-error">{t("soundBoard.risk.missingFile" as MessageKey)}</span> : null}
                  {asset && !asset.playable ? <span className="status-badge issue-warning">{t("soundBoard.risk.playbackUnsupported" as MessageKey)}</span> : null}
                </div>
                {candidate.fitReasons.length ? (
                  <div className="similar-reasons">
                    {candidate.fitReasons.slice(0, 4).map((reason) => (
                      <span key={`${candidate.id}-${reason.code}`}>{reason.code}</span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="candidate-actions">
                <button className="icon-button" type="button" disabled={!playable} onClick={() => void onPlayAsset(candidate.assetId)} title={t("player.play")} aria-label={t("player.play")}>
                  <Play size={14} aria-hidden="true" />
                </button>
                <button className="icon-button" type="button" disabled={!compareBase || !playable} onClick={() => compareBase && void onCompareAssets([compareBase, candidate.assetId])} title={t("similarity.addToCompare" as MessageKey)} aria-label={t("similarity.addToCompare" as MessageKey)}>
                  <GitCompareArrows size={14} aria-hidden="true" />
                </button>
                <button className="secondary-button compact" type="button" disabled={candidate.rejected || !playable} onClick={async () => {
                  await window.suwolAudio.usageCandidates.setSelected(candidate.id, !candidate.selected);
                  onCandidateChanged(item.id);
                }} title={t("soundBoard.selected" as MessageKey)} aria-label={t("soundBoard.selected" as MessageKey)}>
                  <Check size={14} aria-hidden="true" className={candidate.selected ? "is-active-icon" : ""} />
                  {candidate.selected ? t("soundBoard.selected" as MessageKey) : t("soundBoard.setSelected" as MessageKey)}
                </button>
                <button className="secondary-button compact" type="button" disabled={!candidate.selected} onClick={async () => {
                  await window.suwolAudio.usageCandidates.update(candidate.id, { approved: !candidate.approved });
                  onCandidateChanged(item.id);
                }}>
                  {candidate.approved ? t("soundBoard.approved" as MessageKey) : t("soundBoard.approve" as MessageKey)}
                </button>
                <button className="secondary-button compact" type="button" onClick={async () => {
                  await window.suwolAudio.usageCandidates.setRejected(candidate.id, !candidate.rejected);
                  onCandidateChanged(item.id);
                }} title={t("soundBoard.rejected" as MessageKey)} aria-label={t("soundBoard.rejected" as MessageKey)}>
                  <XCircle size={14} aria-hidden="true" className={candidate.rejected ? "is-active-icon" : ""} />
                  {candidate.rejected ? t("common.restore") : t("soundBoard.rejected" as MessageKey)}
                </button>
                <button className="secondary-button compact" type="button" onClick={() => onSuggestForAsset(candidate.assetId)}>
                  {t("soundBoard.findSimilar" as MessageKey)}
                </button>
                <button className="icon-button" type="button" onClick={async () => {
                  if (!window.confirm(t("soundBoard.removeCandidateConfirm" as MessageKey))) {
                    return;
                  }
                  await window.suwolAudio.usageCandidates.remove(candidate.id);
                  onCandidateChanged(item.id);
                }} title={t("soundBoard.removeLink" as MessageKey)} aria-label={t("soundBoard.removeLink" as MessageKey)}>
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
              <CandidateReviewFields
                candidate={candidate}
                onSaved={() => onCandidateChanged(item.id)}
              />
            </div>
          );
        })}
      </div>

      <div className="candidate-picker">
        <label className="search-box">
          <Search size={15} aria-hidden="true" />
          <input value={assetSearch} placeholder={t("soundBoard.searchAssets" as MessageKey)} onChange={(event) => onAssetSearchChange(event.target.value)} />
        </label>
        {assetResults.map((asset) => (
          <button key={asset.id} className="candidate-pick-row" type="button" disabled={existingAssetIds.has(asset.id)} onClick={() => onAddCandidate(asset.id)}>
            <span>{asset.title || asset.fileName}</span>
            <small>{existingAssetIds.has(asset.id) ? t("soundBoard.alreadyCandidate" as MessageKey) : format.duration(asset.audioAnalysis?.durationMs)}</small>
          </button>
        ))}
      </div>

      <button className="secondary-button compact" type="button" onClick={onSuggest}>
        <Sparkles size={14} aria-hidden="true" />
        {t("soundBoard.suggestCandidates" as MessageKey)}
      </button>
      {suggestions.length > 0 ? (
        <div className="candidate-list">
          {suggestions.map((suggestion) => (
            <button key={suggestion.asset.id} className="candidate-pick-row" type="button" disabled={existingAssetIds.has(suggestion.asset.id)} onClick={() => onAddCandidate(suggestion.asset.id, suggestion)}>
              <span>{suggestion.asset.title || suggestion.asset.fileName}</span>
              <small>
                {existingAssetIds.has(suggestion.asset.id)
                  ? t("soundBoard.alreadyCandidate" as MessageKey)
                  : `${Math.round(suggestion.score * 100)}% / ${suggestion.source} / ${suggestion.reasons.slice(0, 2).map((reason) => reason.code).join(", ")}`}
              </small>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function CandidateReviewFields({
  candidate,
  onSaved,
}: {
  candidate: SoundUsageCandidateRecord;
  onSaved: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const [draft, setDraft] = useState({
    pros: candidate.pros,
    cons: candidate.cons,
    reviewNote: candidate.reviewNote,
    decisionReason: candidate.decisionReason,
    ratingForUsage: candidate.ratingForUsage,
    loudnessFit: candidate.loudnessFit,
    loopFit: candidate.loopFit,
    moodFit: candidate.moodFit,
  });
  useEffect(() => {
    setDraft({
      pros: candidate.pros,
      cons: candidate.cons,
      reviewNote: candidate.reviewNote,
      decisionReason: candidate.decisionReason,
      ratingForUsage: candidate.ratingForUsage,
      loudnessFit: candidate.loudnessFit,
      loopFit: candidate.loopFit,
      moodFit: candidate.moodFit,
    });
  }, [candidate.id, candidate.updatedAt]);
  const dirty =
    draft.pros !== candidate.pros ||
    draft.cons !== candidate.cons ||
    draft.reviewNote !== candidate.reviewNote ||
    draft.decisionReason !== candidate.decisionReason ||
    draft.ratingForUsage !== candidate.ratingForUsage ||
    draft.loudnessFit !== candidate.loudnessFit ||
    draft.loopFit !== candidate.loopFit ||
    draft.moodFit !== candidate.moodFit;
  return (
    <div className="candidate-review-fields">
      <div className="sound-editor-grid">
        <label>
          {t("soundBoard.candidate.ratingForUsage" as MessageKey)}
          <input
            type="number"
            min="0"
            max="5"
            value={draft.ratingForUsage ?? ""}
            onChange={(event) => setDraft({ ...draft, ratingForUsage: event.target.value ? Number(event.target.value) : null })}
          />
        </label>
        <label>
          {t("soundBoard.candidate.loudnessFit" as MessageKey)}
          <input value={draft.loudnessFit} onChange={(event) => setDraft({ ...draft, loudnessFit: event.target.value })} />
        </label>
        <label>
          {t("soundBoard.candidate.loopFit" as MessageKey)}
          <input value={draft.loopFit} onChange={(event) => setDraft({ ...draft, loopFit: event.target.value })} />
        </label>
        <label>
          {t("soundBoard.candidate.moodFit" as MessageKey)}
          <input value={draft.moodFit} onChange={(event) => setDraft({ ...draft, moodFit: event.target.value })} />
        </label>
      </div>
      <label>
        {t("soundBoard.candidate.pros" as MessageKey)}
        <textarea value={draft.pros} onChange={(event) => setDraft({ ...draft, pros: event.target.value })} />
      </label>
      <label>
        {t("soundBoard.candidate.cons" as MessageKey)}
        <textarea value={draft.cons} onChange={(event) => setDraft({ ...draft, cons: event.target.value })} />
      </label>
      <label>
        {t("soundBoard.candidate.reviewNote" as MessageKey)}
        <textarea value={draft.reviewNote} onChange={(event) => setDraft({ ...draft, reviewNote: event.target.value })} />
      </label>
      <label>
        {t("soundBoard.candidate.decisionReason" as MessageKey)}
        <textarea value={draft.decisionReason} onChange={(event) => setDraft({ ...draft, decisionReason: event.target.value })} />
      </label>
      <button
        className="secondary-button compact"
        type="button"
        disabled={!dirty}
        onClick={async () => {
          await window.suwolAudio.soundWorkflow.updateCandidateReview(candidate.id, draft);
          onSaved();
        }}
      >
        {t("soundBoard.candidate.saveReview" as MessageKey)}
      </button>
    </div>
  );
}

function formatDb(value: number | null | undefined): string {
  return Number.isFinite(value) ? `${(value as number).toFixed(1)} dB` : "-";
}

function targetForSoundBoardFormat(format: SoundBoardExportFormat): ExportTargetType {
  if (format === "sound_pack") {
    return "project_sound_pack";
  }
  if (format === "missing_report") {
    return "project_missing_report";
  }
  if (format === "codex_instruction") {
    return "project_codex_instruction";
  }
  return "project_manifest";
}

function engineForSoundBoardFormat(format: SoundBoardExportFormat, fallback: GameEngineType): GameEngineType {
  if (format === "unity_manifest") {
    return "unity";
  }
  if (format === "unreal_manifest") {
    return "unreal";
  }
  if (format === "monogame_manifest") {
    return "monogame";
  }
  if (format === "generic_manifest") {
    return "generic";
  }
  return fallback;
}
