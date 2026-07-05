import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AnalysisAppService } from "../analysis-app-service";
import { AssetService } from "../asset-service";
import { AudioFeatureService } from "../audio-feature-service";
import { AudioSimilarityService } from "../audio-similarity-service";
import { ExportCenterService } from "../export-center-service";
import { GameProjectService } from "../game-project-service";
import { ImportService } from "../import-service";
import { LibraryService } from "../library-service";
import { ProjectSoundPackService } from "../project-sound-pack-service";
import { SoundBoardExportService } from "../sound-board-export-service";
import { SoundBoardValidationService } from "../sound-board-validation-service";
import { SoundCandidateService } from "../sound-candidate-service";
import { SoundChecklistService } from "../sound-checklist-service";
import { SoundChangeReviewExportService } from "../sound-change-review-export-service";
import { SoundChangeReviewService } from "../sound-change-review-service";
import { SoundPackChangelogService } from "../sound-pack-changelog-service";
import { SoundPackDiffService } from "../sound-pack-diff-service";
import { SoundPackSnapshotService } from "../sound-pack-snapshot-service";
import { SoundRequestExportService } from "../sound-request-export-service";
import { SoundStyleGuideService } from "../sound-style-guide-service";
import { SoundUsageBulkImportService } from "../sound-usage-bulk-import-service";
import { SoundUsageService } from "../sound-usage-service";
import { SoundUsageTemplateService } from "../sound-usage-template-service";
import { SoundWorkflowService } from "../sound-workflow-service";
import { TagService } from "../tag-service";

describe("sound board services", () => {
  it("creates, updates, summarizes, and archives game projects", async () => {
    const services = await createServices();

    const project = services.projectService.createProject({
      name: "Project A",
      engineType: "unity",
      defaultExportFormat: "unity_manifest",
    });
    const updated = services.projectService.updateProject(project.id, {
      rootNamespace: "Suwol.Audio",
      engineType: "unreal",
    });
    const summary = services.projectService.getSummary(project.id);
    const archived = services.projectService.archiveProject(project.id);

    expect(updated.rootNamespace).toBe("Suwol.Audio");
    expect(updated.engineType).toBe("unreal");
    expect(summary.total).toBe(0);
    expect(archived.archivedAt).toBeTruthy();
    expect(services.projectService.listProjects()).toHaveLength(0);
  });

  it("creates usage items, prevents duplicate keys, and applies templates only when requested", async () => {
    const services = await createServices();
    const project = services.projectService.createProject({ name: "Template Test" });

    expect(await services.usageService.listItems({ projectId: project.id })).toHaveLength(0);
    const item = await services.usageService.createItem({
      projectId: project.id,
      key: "UI Click!",
      displayName: "UI Click",
      category: "ui",
    });
    await expect(
      services.usageService.createItem({ projectId: project.id, key: "ui.click", displayName: "Duplicate" }),
    ).rejects.toThrow();

    const templateResult = await services.usageService.bulkCreateFromTemplate(project.id, "basic_mobile_ui");
    const duplicateTemplateResult = await services.usageService.bulkCreateFromTemplate(project.id, "basic_mobile_ui");

    expect(item.key).toBe("ui.click");
    expect(templateResult.success).toBeGreaterThan(0);
    expect(duplicateTemplateResult.skipped).toBeGreaterThan(0);
  });

  it("links candidates, keeps a single selected asset unless variants are allowed, and never auto-selects suggestions", async () => {
    const services = await createServices();
    const assets = await importTwoAssets(services);
    const project = services.projectService.createProject({ name: "Candidate Test" });
    const item = await services.usageService.createItem({
      projectId: project.id,
      key: "sfx.hit",
      displayName: "Hit",
      category: "sfx",
    });

    const first = await services.candidateService.addCandidate({ usageItemId: item.id, assetId: assets[0]!.id, selected: true });
    const second = await services.candidateService.addCandidate({ usageItemId: item.id, assetId: assets[1]!.id, selected: true });
    let candidates = await services.candidateService.listCandidates(item.id);

    expect(first.id).toBeTruthy();
    expect(second.selected).toBe(true);
    expect(candidates.filter((candidate) => candidate.selected)).toHaveLength(1);

    await services.usageService.updateItem(item.id, { variantsAllowed: true });
    await services.candidateService.setSelected(first.id, true);
    candidates = await services.candidateService.listCandidates(item.id);
    expect(candidates.filter((candidate) => candidate.selected)).toHaveLength(2);

    await services.candidateService.setRejected(first.id, true);
    candidates = await services.candidateService.listCandidates(item.id);
    expect(candidates.find((candidate) => candidate.id === first.id)).toMatchObject({ selected: false, rejected: true });
    await expect(services.candidateService.setSelected(first.id, true)).rejects.toThrow("REJECTED_CANDIDATE_RESTORE_REQUIRED");

    await services.candidateService.setRejected(first.id, false);
    await services.candidateService.setSelected(first.id, true);
    candidates = await services.candidateService.listCandidates(item.id);
    expect(candidates.find((candidate) => candidate.id === first.id)).toMatchObject({ selected: true, rejected: false });

    const suggestions = await services.candidateService.suggest({ usageItemId: item.id, limit: 5 });
    expect(suggestions.every((suggestion) => !candidates.some((candidate) => candidate.assetId === suggestion.asset.id))).toBe(true);
  });

  it("reports missing sounds and exports usage-aware manifests", async () => {
    const services = await createServices();
    const assets = await importTwoAssets(services);
    const project = services.projectService.createProject({ name: "Export Test", engineType: "monogame" });
    const missing = await services.usageService.createItem({
      projectId: project.id,
      key: "ui.missing",
      displayName: "Missing UI",
      category: "ui",
      required: true,
    });
    const selected = await services.usageService.createItem({
      projectId: project.id,
      key: "bgm.menu",
      displayName: "Menu BGM",
      category: "bgm",
      loopRequired: true,
    });
    await services.candidateService.addCandidate({ usageItemId: selected.id, assetId: assets[0]!.id, selected: true });

    const report = await services.usageService.getMissingReport(project.id);
    const generic = await services.exportService.preview({ projectId: project.id, format: "generic_manifest" });
    const unity = await services.exportService.preview({ projectId: project.id, format: "unity_manifest" });
    const unreal = await services.exportService.preview({ projectId: project.id, format: "unreal_manifest" });
    const monogame = await services.exportService.preview({ projectId: project.id, format: "monogame_manifest" });
    const codex = await services.exportService.preview({ projectId: project.id, format: "codex_instruction" });
    const outputRoot = join(services.rootPath, "exports");
    const result = await services.exportService.run({ projectId: project.id, format: "missing_report" }, outputRoot);

    expect(report.requiredMissing.map((item) => item.id)).toContain(missing.id);
    expect(generic.previewText).toContain("\"usageKey\": \"bgm.menu\"");
    expect(unity.previewText).toContain("\"usageKey\": \"bgm.menu\"");
    expect(unreal.previewText).toContain("UsageKey");
    expect(monogame.previewText).toContain("# usageKey: bgm.menu");
    expect(codex.previewText).toContain("## Sound Usage Board");
    expect(result.outputPath).toBeTruthy();
    await expect(access(result.outputPath!)).resolves.toBeUndefined();
    expect(await readFile(result.outputPath!, "utf8")).toContain("Required Missing");
  });

  it("previews and creates pasted usage rows with duplicate and conflict handling", async () => {
    const services = await createServices();
    const project = services.projectService.createProject({ name: "Bulk Import Test" });
    await services.usageService.createItem({
      projectId: project.id,
      key: "ui.button.click",
      displayName: "Old Click",
      category: "ui",
    });

    const text = [
      "# comment",
      "",
      "ui.button.click, ui, Button Click, high",
      "combat.hit.light, weird, Light Hit, strange, loop",
      "combat.hit.light, sfx, Duplicate Hit, normal",
    ].join("\n");
    const preview = services.bulkImportService.preview({ projectId: project.id, text, conflictMode: "update" });
    const result = await services.bulkImportService.create({ projectId: project.id, text, conflictMode: "update", confirmed: true });
    const items = await services.usageService.listItems({ projectId: project.id, sort: "key" });

    expect(preview.validCount).toBe(3);
    expect(preview.updateCount).toBe(1);
    expect(preview.createCount).toBe(1);
    expect(preview.duplicateCount).toBe(1);
    expect(preview.alreadyExistsCount).toBe(1);
    expect(preview.unknownCategoryCount).toBe(1);
    expect(preview.unknownPriorityCount).toBe(1);
    expect(preview.loopDetectedCount).toBe(1);
    expect(preview.commentLineCount).toBe(1);
    expect(preview.blankLineCount).toBe(1);
    expect(result.success).toBe(2);
    expect(result.skipped).toBe(1);
    expect(items.map((item) => item.key)).toEqual(["combat.hit.light", "ui.button.click"]);
    expect(items.find((item) => item.key === "ui.button.click")?.displayName).toBe("Button Click");
    expect(items.find((item) => item.key === "combat.hit.light")).toMatchObject({ category: "sfx", priority: "normal", loopRequired: true });
  });

  it("saves, applies, renames, and deletes custom sound board templates", async () => {
    const services = await createServices();
    const source = services.projectService.createProject({ name: "Source Template", engineType: "unity" });
    await services.usageService.createItem({ projectId: source.id, key: "ui.confirm", category: "ui", priority: "high" });
    await services.usageService.createItem({ projectId: source.id, key: "bgm.menu", category: "bgm", loopRequired: true });

    const template = await services.templateService.createFromProject({ projectId: source.id, name: "Studio UI" });
    const target = services.projectService.createProject({ name: "Target Template" });
    const preview = await services.templateService.previewApply({ projectId: target.id, templateId: template.id });
    const applyResult = await services.templateService.apply({ projectId: target.id, templateId: template.id });
    const renamed = services.templateService.rename(template.id, "Studio UI v2");
    const deleteResult = services.templateService.delete(template.id);

    expect(template.builtIn).toBe(false);
    expect(preview.createCount).toBe(2);
    expect(applyResult.success).toBe(2);
    expect(await services.usageService.listItems({ projectId: target.id })).toHaveLength(2);
    expect(renamed.name).toBe("Studio UI v2");
    expect(deleteResult.success).toBe(1);
    expect(services.templateService.listTemplates().some((item) => item.id === template.id)).toBe(false);
  });

  it("validates board risk state, tracks review status, links assets, and strengthens export preview", async () => {
    const services = await createServices();
    const assets = await importTwoAssets(services);
    const project = services.projectService.createProject({ name: "Validation Test", engineType: "unity" });
    const missing = await services.usageService.createItem({
      projectId: project.id,
      key: "ui.missing",
      displayName: "Missing UI",
      category: "ui",
      required: true,
    });
    const loop = await services.usageService.createItem({
      projectId: project.id,
      key: "bgm.menu",
      displayName: "Menu BGM",
      category: "bgm",
      priority: "critical",
      required: true,
      loopRequired: true,
    });
    const optional = await services.usageService.createItem({
      projectId: project.id,
      key: "sfx.optional",
      displayName: "Optional SFX",
      category: "sfx",
      priority: "critical",
      required: false,
    });
    const candidate = await services.candidateService.addCandidate({
      usageItemId: loop.id,
      assetId: assets[0]!.id,
      selected: true,
    });

    await services.candidateService.updateCandidate(candidate.id, { approved: true });
    const reviewing = await services.usageService.updateStatus(loop.id, "reviewing", "manual review");
    const approved = await services.usageService.updateStatus(loop.id, "approved");
    const normalized = await services.usageService.applySuggestedKey(missing.id, "UI Missing Fixed");
    const links = await services.validationService.getAssetLinks(assets[0]!.id);
    const validation = await services.validationService.validateBoard(project.id);
    const riskItems = await services.usageService.listItems({ projectId: project.id, riskFilter: "has_risks", sort: "riskCount" });
    const requiredItems = await services.usageService.listItems({ projectId: project.id, riskFilter: "required" });
    const criticalItems = await services.usageService.listItems({ projectId: project.id, riskFilter: "critical" });
    const loopItems = await services.usageService.listItems({ projectId: project.id, riskFilter: "loop_required" });
    const requiredFirst = await services.usageService.listItems({ projectId: project.id, sort: "requiredFirst" });
    const preview = await services.exportService.preview({
      projectId: project.id,
      format: "codex_instruction",
      copySelectedAudioFiles: true,
    });

    expect(reviewing.status).toBe("reviewing");
    expect(approved.status).toBe("approved");
    expect(normalized.key).toBe("ui.missing.fixed");
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ usageItemId: loop.id, selected: true, approved: true });
    expect(validation.ok).toBe(false);
    expect(validation.dashboard.total).toBe(3);
    expect(validation.dashboard.required).toBe(2);
    expect(validation.dashboard.noCandidates).toBe(2);
    expect(validation.issues.map((issue) => issue.code)).toContain("REQUIRED_MISSING");
    expect(validation.issues.map((issue) => issue.code)).toContain("UNKNOWN_LICENSE");
    expect(riskItems.map((item) => item.key)).toContain("ui.missing.fixed");
    expect(riskItems.map((item) => item.key)).toContain(optional.key);
    expect(requiredItems.map((item) => item.key)).toEqual(expect.arrayContaining(["ui.missing.fixed", "bgm.menu"]));
    expect(criticalItems.map((item) => item.key)).toEqual(expect.arrayContaining(["bgm.menu", "sfx.optional"]));
    expect(loopItems.map((item) => item.key)).toEqual(["bgm.menu"]);
    expect(requiredFirst.map((item) => item.key).indexOf("sfx.optional")).toBeGreaterThan(
      requiredFirst.map((item) => item.key).indexOf("ui.missing.fixed"),
    );
    expect(preview.errorCount).toBeGreaterThan(0);
    expect(preview.warningCount).toBeGreaterThan(0);
    expect(preview.copiedFileCount).toBe(1);
    expect(preview.skippedFileCount).toBe(0);
    expect(preview.validationIssues?.length).toBeGreaterThan(0);
    expect(preview.previewText).toContain("## Risk List");
  });

  it("previews and exports approved-only project sound packs with docs, manifests, and rename plans", async () => {
    const services = await createServices();
    const assets = await importTwoAssets(services);
    const project = services.projectService.createProject({ name: "Sound Pack Test", engineType: "unity" });
    const click = await services.usageService.createItem({
      projectId: project.id,
      key: "ui.button.click",
      displayName: "Button Click",
      category: "ui",
      required: true,
    });
    const hit = await services.usageService.createItem({
      projectId: project.id,
      key: "combat.hit.light",
      displayName: "Light Hit",
      category: "sfx",
      required: false,
    });
    const clickCandidate = await services.candidateService.addCandidate({ usageItemId: click.id, assetId: assets[0]!.id, selected: true });
    await services.candidateService.updateCandidate(clickCandidate.id, { approved: true });
    await services.candidateService.addCandidate({ usageItemId: hit.id, assetId: assets[1]!.id, selected: true });
    await saveRights(services, assets[0]!.id, { licenseName: "CC0", commercialUseStatus: "allowed", creditRequired: "no" });
    const originalBytes = await readFile(assets[0]!.originalPath);
    const outputRoot = join(services.rootPath, "project-sound-pack-output");

    const preview = await services.projectSoundPackService.preview({
      projectId: project.id,
      outputPath: outputRoot,
      engineProfile: "unity",
      filenamePolicy: "usage_key",
    });
    const blocked = await services.projectSoundPackService.export({
      projectId: project.id,
      outputPath: outputRoot,
      engineProfile: "unity",
      filenamePolicy: "usage_key",
    }, outputRoot);
    const result = await services.projectSoundPackService.export({
      projectId: project.id,
      outputPath: outputRoot,
      engineProfile: "unity",
      filenamePolicy: "usage_key",
      acknowledgeWarnings: true,
    }, outputRoot);

    expect(preview.ok).toBe(true);
    expect(preview.summary.requestedUsageItems).toBe(2);
    expect(preview.summary.filesToCopy).toBe(1);
    expect(preview.summary.approvedSelectedCount).toBe(1);
    expect(preview.summary.selectedButNotApprovedCount).toBe(1);
    expect(preview.warnings.map((issue) => issue.code)).toContain("SELECTED_NOT_APPROVED");
    expect(preview.renamePlan[0]).toMatchObject({
      usageKey: "ui.button.click",
      outputFileName: "ui_button_click.wav",
      outputRelativePath: "Assets/Audio/UI/ui_button_click.wav",
      renamed: true,
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.error?.code).toBe("PROJECT_SOUND_PACK_VALIDATION_BLOCKED");
    expect(result.ok).toBe(true);
    expect(result.outputPath).toBeTruthy();
    await expect(access(join(result.outputPath!, "Assets", "Audio", "UI", "ui_button_click.wav"))).resolves.toBeUndefined();
    expect(await readFile(join(result.outputPath!, "manifest.json"), "utf8")).toContain("\"usageKey\": \"ui.button.click\"");
    expect(await readFile(join(result.outputPath!, "UnityAudioManifest.json"), "utf8")).toContain("\"addressableKey\": \"ui_button_click\"");
    expect(await readFile(join(result.outputPath!, "README.md"), "utf8")).toContain("No audio conversion");
    expect(await readFile(join(result.outputPath!, "credits.md"), "utf8")).toContain("CC0");
    expect(await readFile(join(result.outputPath!, "missing-sounds.md"), "utf8")).toContain("Selected But Not Approved");
    expect(await readFile(join(result.outputPath!, "validation-report.md"), "utf8")).toContain("Recommended Manual Checks");
    expect(await readFile(join(result.outputPath!, "metadata", "selected-assets.csv"), "utf8")).toContain("ui_button_click.wav");
    expect(await readFile(assets[0]!.originalPath)).toEqual(originalBytes);
  });

  it("routes project exports through Export Center with presets, history, and filtered sources", async () => {
    const services = await createServices();
    const assets = await importTwoAssets(services);
    const project = services.projectService.createProject({ name: "Center Project", engineType: "unity" });
    const click = await services.usageService.createItem({
      projectId: project.id,
      key: "ui.click",
      displayName: "Click",
      category: "ui",
      required: true,
    });
    const skip = await services.usageService.createItem({
      projectId: project.id,
      key: "sfx.skip",
      displayName: "Skip",
      category: "sfx",
    });
    const candidate = await services.candidateService.addCandidate({ usageItemId: click.id, assetId: assets[0]!.id, selected: true });
    await services.candidateService.updateCandidate(candidate.id, { approved: true });
    await saveRights(services, assets[0]!.id, { licenseName: "CC0", commercialUseStatus: "allowed", creditRequired: "no" });

    const sources = await services.exportCenterService.listProjectSources();
    const directPreview = await services.projectSoundPackService.preview({
      projectId: project.id,
      usageItemIds: [click.id],
      engineProfile: "unity",
      filenamePolicy: "usage_key",
      soundPackName: "Center Pack",
    });
    const centerPreview = await services.exportCenterService.preview({
      target: "project_sound_pack",
      source: { type: "gameProject", projectId: project.id, name: project.name, usageItemIds: [click.id] },
      engineProfile: "unity",
      filenamePolicy: "usage_key",
      soundPackName: "Center Pack",
    });
    const filteredManifest = await services.exportCenterService.preview({
      target: "project_manifest",
      source: { type: "gameProject", projectId: project.id, name: project.name, usageItemIds: [click.id] },
      engineProfile: "unity",
    });
    const mismatch = await services.exportCenterService.preview({
      target: "project_sound_pack",
      source: { type: "library" },
    });
    const preset = services.exportCenterService.savePreset({
      name: "Project Pack",
      type: "project_sound_pack",
      config: {
        target: "project_sound_pack",
        source: { type: "gameProject", projectId: project.id, name: project.name },
        engineProfile: "unity",
      },
    });
    const builtInRows = services.libraryService.requireActive().db.all<{ id: string }>(
      "SELECT id FROM export_presets WHERE id LIKE 'built-in-project-%'",
    );
    const outputRoot = join(services.rootPath, "center-export");
    const success = await services.exportCenterService.run({
      target: "project_missing_report",
      source: { type: "gameProject", projectId: project.id, name: project.name, usageItemIds: [skip.id] },
      engineProfile: "unity",
    }, outputRoot);
    const failure = await services.exportCenterService.run({
      target: "project_sound_pack",
      source: { type: "library" },
    }, outputRoot);
    const history = services.exportCenterService.listHistory({ limit: 10 });

    expect(sources.map((source) => source.project.id)).toContain(project.id);
    expect(centerPreview.assetCount).toBe(directPreview.summary.includedUsageItems);
    expect(centerPreview.plannedFiles.some((file) => file.path.includes("UnityAudioManifest.json"))).toBe(true);
    expect(filteredManifest.assetCount).toBe(1);
    expect(mismatch.ok).toBe(false);
    expect(mismatch.issues[0]?.code).toBe("EXPORT_TYPE_SOURCE_MISMATCH");
    expect(preset.type).toBe("project_sound_pack");
    expect(builtInRows).toHaveLength(0);
    expect(success.ok).toBe(true);
    expect(await readFile(success.outputPath!, "utf8")).toContain("sfx.skip");
    expect(failure.ok).toBe(false);
    expect(history.map((item) => item.status)).toEqual(expect.arrayContaining(["success", "failure"]));
    expect(services.exportCenterService.deleteHistory(history[0]!.id).success).toBe(1);
  });

  it("creates sound pack snapshots, diffs current changes, exports changelogs, and previews rollback safely", async () => {
    const services = await createServices();
    const assets = await importTwoAssets(services);
    const project = services.projectService.createProject({ name: "Snapshot Project", engineType: "unity" });
    const click = await services.usageService.createItem({
      projectId: project.id,
      key: "ui.click",
      displayName: "Click",
      category: "ui",
      required: true,
    });
    const first = await services.candidateService.addCandidate({ usageItemId: click.id, assetId: assets[0]!.id, selected: true });
    await services.candidateService.updateCandidate(first.id, { approved: true });
    await saveRights(services, assets[0]!.id, { licenseName: "CC0", commercialUseStatus: "allowed", creditRequired: "no" });

    const snapshot = await services.snapshotService.create({
      projectId: project.id,
      name: "Baseline",
      freeze: true,
    });
    const baselineProject = await services.snapshotService.setBaseline(snapshot.id);
    const second = await services.candidateService.addCandidate({ usageItemId: click.id, assetId: assets[1]!.id, selected: true });
    await services.candidateService.updateCandidate(second.id, { approved: true });

    const diff = await services.diffService.compare({ projectId: project.id, fromSnapshotId: snapshot.id, compareToCurrent: true });
    const changelog = await services.changelogService.preview({ projectId: project.id, fromSnapshotId: snapshot.id, compareToCurrent: true });
    const centerChangelog = await services.exportCenterService.preview({
      target: "sound_pack_changelog_markdown",
      source: { type: "gameProject", projectId: project.id, name: project.name },
      fromSnapshotId: snapshot.id,
      compareToCurrent: true,
    });
    const outputRoot = join(services.rootPath, "snapshot-export");
    const snapshotExport = await services.exportCenterService.run({
      target: "sound_pack_snapshot_json",
      source: { type: "gameProject", projectId: project.id, name: project.name },
      snapshotId: snapshot.id,
    }, outputRoot);
    const changelogExport = await services.exportCenterService.run({
      target: "sound_pack_changelog_json",
      source: { type: "gameProject", projectId: project.id, name: project.name },
      fromSnapshotId: snapshot.id,
      compareToCurrent: true,
    }, outputRoot);
    const rollbackPreview = await services.snapshotService.rollbackPreview(snapshot.id);
    const rollbackResult = await services.snapshotService.rollbackApply({ snapshotId: snapshot.id, confirmed: true });
    const restoredCandidates = await services.candidateService.listCandidates(click.id);

    expect(snapshot.frozen).toBe(true);
    expect(snapshot.itemCount).toBe(1);
    expect(snapshot.selectedCount).toBe(1);
    expect(baselineProject.baselineSnapshotId).toBe(snapshot.id);
    expect(diff.summary.selectionChanges).toBeGreaterThan(0);
    expect(changelog.previewText).toContain("Sound Pack Changelog");
    expect(changelog.previewText).toContain("ui.click");
    expect(centerChangelog.plannedFiles[0]?.path).toContain("sound-pack-changelog.md");
    expect(snapshotExport.ok).toBe(true);
    expect(snapshotExport.files[0]).toContain("sound-pack-snapshot.json");
    expect(await readFile(snapshotExport.files[0]!, "utf8")).toContain("\"key\": \"ui.click\"");
    expect(changelogExport.ok).toBe(true);
    expect(changelogExport.files[0]).toContain("sound-pack-changelog.json");
    expect(rollbackPreview.canApply).toBe(true);
    expect(rollbackResult.updatedUsageItems).toBeGreaterThan(0);
    expect(restoredCandidates.find((candidate) => candidate.assetId === assets[0]!.id)).toMatchObject({ selected: true, approved: true });
    expect(restoredCandidates.find((candidate) => candidate.assetId === assets[1]!.id)).toMatchObject({ selected: false, approved: false });
  });

  it("creates sound change reviews, records decisions, exports reports, and filters changelogs by review status", async () => {
    const services = await createServices();
    const assets = await importTwoAssets(services);
    const project = services.projectService.createProject({ name: "Review Project", engineType: "unity" });
    const click = await services.usageService.createItem({
      projectId: project.id,
      key: "ui.click",
      displayName: "Click",
      category: "ui",
      required: true,
    });
    const removed = await services.usageService.createItem({
      projectId: project.id,
      key: "sfx.old",
      displayName: "Old SFX",
      category: "sfx",
      required: true,
    });
    const first = await services.candidateService.addCandidate({ usageItemId: click.id, assetId: assets[0]!.id, selected: true });
    await services.candidateService.updateCandidate(first.id, { approved: true });
    await saveRights(services, assets[0]!.id, { licenseName: "CC0", commercialUseStatus: "allowed", creditRequired: "no" });

    const snapshot = await services.snapshotService.create({ projectId: project.id, name: "Review Baseline", freeze: true });
    await services.snapshotService.setBaseline(snapshot.id);
    const second = await services.candidateService.addCandidate({ usageItemId: click.id, assetId: assets[1]!.id, selected: true });
    await services.candidateService.updateCandidate(second.id, { approved: true });
    await services.usageService.deleteItem(removed.id);

    const review = await services.changeReviewService.createFromBaseline({ projectId: project.id });
    const initialValidation = await services.validationService.validateBoard(project.id);
    const selectionItem = review.items.find((item) => item.changeType === "selection_changed");
    const removedItem = review.items.find((item) => item.changeType === "usage_removed");
    const otherPending = review.items.find((item) => item.id !== selectionItem?.id && item.id !== removedItem?.id);

    expect(review.summary.totalChanges).toBeGreaterThan(0);
    expect(review.summary.pending).toBe(review.items.length);
    expect(JSON.stringify(selectionItem?.before)).toContain(assets[0]!.id);
    expect(initialValidation.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["PENDING_BREAKING_CHANGES", "PENDING_SELECTED_ASSET_CHANGES"]),
    );

    if (!selectionItem || !removedItem) {
      throw new Error("Expected selection and removal review items.");
    }
    const approved = services.changeReviewService.updateItemStatus(selectionItem.id, {
      status: "approved",
      decisionReason: "Clearer click sound for mobile UI",
    });
    const rejected = services.changeReviewService.updateItemStatus(removedItem.id, { status: "rejected" });
    const noted = services.changeReviewService.updateItemNote(approved.id, { reviewerNote: "Lead approved." });
    if (otherPending) {
      services.changeReviewService.bulkUpdateItems({ reviewId: review.id, itemIds: [otherPending.id], status: "deferred" });
    }
    const decided = services.changeReviewService.get(review.id)!;
    const rejectedValidation = await services.validationService.validateBoard(project.id);
    const markdown = services.changeReviewExportService.preview({
      reviewId: review.id,
      format: "markdown",
      includeBeforeAfterDetails: true,
    });
    const json = services.changeReviewExportService.preview({ reviewId: review.id, format: "json" });
    const csv = services.changeReviewExportService.preview({ reviewId: review.id, format: "csv" });
    const outputRoot = join(services.rootPath, "review-export");
    const exported = await services.changeReviewExportService.export({ reviewId: review.id, format: "markdown" }, outputRoot);
    const centerPreview = await services.exportCenterService.preview({
      target: "sound_change_review_markdown",
      source: { type: "gameProject", projectId: project.id, name: project.name },
      reviewId: review.id,
    });
    const centerExport = await services.exportCenterService.run({
      target: "sound_change_review_csv",
      source: { type: "gameProject", projectId: project.id, name: project.name },
      reviewId: review.id,
    }, outputRoot);
    const decisionChangelog = await services.changelogService.preview({
      projectId: project.id,
      fromSnapshotId: snapshot.id,
      compareToCurrent: true,
      reviewId: review.id,
      includeReviewDecisions: true,
      excludeRejectedChanges: true,
    });
    const approvedOnlyChangelog = await services.changelogService.preview({
      projectId: project.id,
      fromSnapshotId: snapshot.id,
      compareToCurrent: true,
      reviewId: review.id,
      approvedChangesOnly: true,
      includeReviewDecisions: true,
    });
    const packPreview = await services.projectSoundPackService.preview({
      projectId: project.id,
      soundPackName: "review-pack",
      includeReviewReport: true,
      copyAudioFiles: false,
      blockIfSelectedFileMissing: false,
    }, outputRoot);
    const archived = services.changeReviewService.archive(review.id);

    expect(approved.status).toBe("approved");
    expect(rejected.status).toBe("rejected");
    expect(noted.reviewerNote).toBe("Lead approved.");
    expect(decided.summary.approved).toBeGreaterThan(0);
    expect(decided.summary.rejected).toBeGreaterThan(0);
    expect(rejectedValidation.issues.map((issue) => issue.code)).toContain("REJECTED_CHANGE_STILL_PRESENT");
    expect(markdown.previewText).toContain("Sound Change Review Report");
    expect(markdown.previewText).toContain("Review approval does not modify audio mappings.");
    expect(json.previewText).toContain("\"review\"");
    expect(csv.previewText).toContain("usageKey");
    expect(exported.files[0]).toContain("sound-change-review.md");
    expect(centerPreview.plannedFiles[0]?.path).toContain("sound-change-review.md");
    expect(centerExport.ok).toBe(true);
    expect(decisionChangelog.previewText).toContain("Review: approved");
    expect(decisionChangelog.previewText).not.toContain("Usage item was removed.");
    expect(approvedOnlyChangelog.diff.changes.every((change) => change.type !== "usage_removed")).toBe(true);
    expect(packPreview.latestReview?.rejectedChangesStillPresent).toBeGreaterThan(0);
    expect(packPreview.plannedFiles.some((file) => file.relativePath === "change-review-report.md")).toBe(true);
    expect(archived.status).toBe("archived");
    expect(services.changeReviewService.list({ projectId: project.id })).toHaveLength(0);
  });

  it("manages workflow notes, candidate reviews, style guides, checklists, and sound request exports", async () => {
    const services = await createServices();
    const assets = await importTwoAssets(services);
    const project = services.projectService.createProject({ name: "Workflow Project", engineType: "unity" });
    const item = await services.usageService.createItem({
      projectId: project.id,
      key: "ui.confirm",
      displayName: "Confirm",
      category: "ui",
      priority: "high",
      workNote: "TODO review click feel",
      assignee: "sound lead",
      dueLabel: "vertical slice",
    });
    const candidate = await services.candidateService.addCandidate({
      usageItemId: item.id,
      assetId: assets[0]!.id,
      selected: true,
    });
    await services.candidateService.updateCandidate(candidate.id, { approved: true });

    const validationBeforeNotes = await services.validationService.validateBoard(project.id);
    expect(validationBeforeNotes.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "APPROVED_DECISION_NOTE_MISSING",
        "SELECTED_REVIEW_NOTE_MISSING",
        "WORK_NOTE_OPEN",
        "STYLE_GUIDE_EMPTY",
        "CHECKLIST_INCOMPLETE",
      ]),
    );

    const updatedItem = await services.workflowService.updateUsageWorkflow(item.id, {
      status: "approved",
      priority: "critical",
      workNote: "Reviewed click feel",
      reviewNote: "Short enough for UI",
      decisionNote: "Use for confirm actions",
    });
    const reviewedCandidate = await services.workflowService.updateCandidateReview(candidate.id, {
      pros: "Clean transient",
      cons: "Needs gain check",
      reviewNote: "Fits compact UI",
      decisionReason: "Best UI match",
      ratingForUsage: 4,
      loudnessFit: "ok",
      loopFit: "not applicable",
      moodFit: "bright",
    });
    const todoSummary = await services.workflowService.getTodoSummary(project.id);
    const todoItems = await services.workflowService.listTodoItems({
      projectId: project.id,
      column: "approved",
      assignee: "sound",
      dueLabel: "slice",
      sort: "updatedWorkflow",
    });

    expect(updatedItem.updatedWorkflowAt).toBeTruthy();
    expect(updatedItem.priority).toBe("critical");
    expect(reviewedCandidate).toMatchObject({ ratingForUsage: 4, pros: "Clean transient" });
    expect(todoSummary.columns.approved).toBeGreaterThan(0);
    expect(todoItems.map((entry) => entry.item.id)).toContain(item.id);

    expect(services.styleGuideService.get(project.id).id).toBe("");
    const guide = services.styleGuideService.update(project.id, {
      overview: "Crisp, low-clutter UI feedback.",
      namingGuide: "Use dotted usage keys.",
    });
    expect(guide.overview).toContain("Crisp");
    expect(services.checklistService.list(project.id).items).toHaveLength(0);
    const checklist = services.checklistService.addBuiltins(project.id);
    expect(checklist.items.length).toBeGreaterThan(0);
    const checked = services.checklistService.update(checklist.items[0]!.id, { checked: true, note: "auditioned" });
    expect(checked.checked).toBe(true);

    const markdownPreview = await services.soundRequestExportService.preview({
      projectId: project.id,
      includeWorkNotes: true,
      includeReviewNotes: true,
      includeCandidateReviewNotes: true,
      includeDecisionNotes: true,
    });
    const csvPreview = await services.soundRequestExportService.preview({ projectId: project.id, format: "csv", includeWorkNotes: true });
    const jsonPreview = await services.soundRequestExportService.preview({
      projectId: project.id,
      format: "json",
      includeCandidateReviewNotes: true,
      includeDecisionNotes: true,
    });
    const stylePreview = await services.soundRequestExportService.preview({ projectId: project.id, documentType: "style_guide" });
    const checklistPreview = await services.soundRequestExportService.preview({ projectId: project.id, documentType: "checklist" });
    const outputRoot = join(services.rootPath, "workflow-export");
    const requestResult = await services.soundRequestExportService.export({
      projectId: project.id,
      includeWorkNotes: true,
      includeCandidateReviewNotes: true,
    }, outputRoot);
    const centerPreview = await services.exportCenterService.preview({
      target: "sound_request_markdown",
      source: { type: "gameProject", projectId: project.id, name: project.name },
      includeStyleGuide: true,
      includeChecklist: true,
      includeWorkNotes: true,
      includeCandidateReviewNotes: true,
    });

    expect(markdownPreview.previewText).toContain("# Sound Request");
    expect(markdownPreview.previewText).toContain("Clean transient");
    expect(csvPreview.previewText).toContain("ui.confirm");
    expect(jsonPreview.previewText).toContain("\"usageKey\": \"ui.confirm\"");
    expect(jsonPreview.previewText).not.toContain(assets[0]!.originalPath);
    expect(stylePreview.previewText).toContain("Crisp, low-clutter");
    expect(checklistPreview.previewText).toContain("auditioned");
    expect(requestResult.ok).toBe(true);
    expect(await readFile(requestResult.outputPath!, "utf8")).toContain("Sound Request");
    expect(centerPreview.plannedFiles.some((file) => file.path.endsWith("suwol-sound-request.md"))).toBe(true);
  });

  it("detects filename collisions, adds variants suffixes, and writes Unreal and MonoGame usage mappings", async () => {
    const services = await createServices();
    const sameNameAssets = await importAssetsWithSameFileName(services);
    const project = services.projectService.createProject({ name: "Engine Pack", engineType: "generic" });
    const first = await services.usageService.createItem({
      projectId: project.id,
      key: "combat.hit.light",
      category: "sfx",
      variantsAllowed: true,
    });
    const second = await services.usageService.createItem({
      projectId: project.id,
      key: "combat.hit.heavy",
      category: "sfx",
    });
    const firstCandidate = await services.candidateService.addCandidate({ usageItemId: first.id, assetId: sameNameAssets[0]!.id, selected: true });
    const secondCandidate = await services.candidateService.addCandidate({ usageItemId: first.id, assetId: sameNameAssets[1]!.id, selected: true });
    const heavyCandidate = await services.candidateService.addCandidate({ usageItemId: second.id, assetId: sameNameAssets[1]!.id, selected: true });
    await services.usageService.updateItem(first.id, { variantsAllowed: true });
    await services.candidateService.updateCandidate(firstCandidate.id, { approved: true });
    await services.candidateService.updateCandidate(secondCandidate.id, { approved: true });
    await services.candidateService.updateCandidate(heavyCandidate.id, { approved: true });
    await saveRights(services, sameNameAssets[0]!.id, { licenseName: "Studio", commercialUseStatus: "allowed", creditRequired: "no" });
    await saveRights(services, sameNameAssets[1]!.id, { licenseName: "Studio", commercialUseStatus: "allowed", creditRequired: "no" });

    const usagePreview = await services.projectSoundPackService.preview({
      projectId: project.id,
      outputPath: join(services.rootPath, "usage-key-pack"),
      filenamePolicy: "usage_key",
      acknowledgeWarnings: true,
    });
    const keepPreview = await services.projectSoundPackService.preview({
      projectId: project.id,
      outputPath: join(services.rootPath, "keep-original-pack"),
      filenamePolicy: "keep_original",
      acknowledgeWarnings: true,
    });
    const unreal = await services.projectSoundPackService.export({
      projectId: project.id,
      outputPath: join(services.rootPath, "unreal-pack"),
      engineProfile: "unreal",
      filenamePolicy: "category_usage_key",
      acknowledgeWarnings: true,
    }, join(services.rootPath, "unreal-pack"));
    const monogame = await services.projectSoundPackService.export({
      projectId: project.id,
      outputPath: join(services.rootPath, "monogame-pack"),
      engineProfile: "monogame",
      filenamePolicy: "category_usage_key",
      acknowledgeWarnings: true,
    }, join(services.rootPath, "monogame-pack"));

    expect(usagePreview.renamePlan.map((entry) => entry.outputFileName)).toEqual(
      expect.arrayContaining(["combat_hit_light_01.wav", "combat_hit_light_02.wav"]),
    );
    expect(keepPreview.summary.duplicateOutputFilenameCount).toBeGreaterThan(0);
    expect(keepPreview.renamePlan.some((entry) => entry.collisionResolved)).toBe(true);
    expect(unreal.ok).toBe(true);
    expect(await readFile(join(unreal.outputPath!, "UnrealAudioManifest.csv"), "utf8")).toContain("UsageKey");
    expect(await readFile(join(unreal.outputPath!, "UnrealAudioManifest.csv"), "utf8")).toContain("combat.hit.light");
    expect(monogame.ok).toBe(true);
    expect(await readFile(join(monogame.outputPath!, "MonoGameContentList.txt"), "utf8")).toContain("# Usage: combat.hit.light");
    await expect(access(join(monogame.outputPath!, "Content", "Audio", "SFX"))).resolves.toBeUndefined();
  });

  it("blocks project sound pack export when a selected source file is missing", async () => {
    const services = await createServices();
    const assets = await importTwoAssets(services);
    const project = services.projectService.createProject({ name: "Missing Pack" });
    const item = await services.usageService.createItem({ projectId: project.id, key: "ui.missing", category: "ui" });
    const candidate = await services.candidateService.addCandidate({ usageItemId: item.id, assetId: assets[0]!.id, selected: true });
    await services.candidateService.updateCandidate(candidate.id, { approved: true });
    await saveRights(services, assets[0]!.id, { licenseName: "CC0", commercialUseStatus: "allowed", creditRequired: "no" });
    await rm(assets[0]!.storedPath!, { force: true });

    const preview = await services.projectSoundPackService.preview({
      projectId: project.id,
      outputPath: join(services.rootPath, "missing-pack"),
    });
    const result = await services.projectSoundPackService.export({
      projectId: project.id,
      outputPath: join(services.rootPath, "missing-pack"),
      acknowledgeWarnings: true,
    }, join(services.rootPath, "missing-pack"));

    expect(preview.ok).toBe(false);
    expect(preview.errors.map((issue) => issue.code)).toContain("PROJECT_SOUND_PACK_MISSING_FILE");
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("PROJECT_SOUND_PACK_VALIDATION_BLOCKED");
  });
});

async function createServices() {
  const rootPath = join(tmpdir(), `suwol-audio-board-${crypto.randomUUID()}`);
  const sourcePath = join(rootPath, "source");
  await mkdir(sourcePath, { recursive: true });
  const libraryService = new LibraryService(join(rootPath, "app-data", "recent.json"));
  await libraryService.createLibrary(join(rootPath, "library"));
  const assetService = new AssetService(libraryService);
  const tagService = new TagService(libraryService);
  const analysisService = new AnalysisAppService(libraryService, assetService, tagService);
  const featureService = new AudioFeatureService(libraryService, assetService, analysisService);
  analysisService.setFeatureService(featureService);
  const similarityService = new AudioSimilarityService(libraryService, assetService, featureService);
  const importService = new ImportService(libraryService, analysisService);
  const projectService = new GameProjectService(libraryService);
  const usageService = new SoundUsageService(libraryService, assetService);
  const candidateService = new SoundCandidateService(libraryService, assetService, similarityService);
  const exportService = new SoundBoardExportService(libraryService, assetService, candidateService);
  const bulkImportService = new SoundUsageBulkImportService(libraryService, assetService);
  const templateService = new SoundUsageTemplateService(libraryService, assetService);
  const validationService = new SoundBoardValidationService(libraryService, assetService, candidateService);
  const workflowService = new SoundWorkflowService(libraryService, assetService, candidateService);
  const styleGuideService = new SoundStyleGuideService(libraryService);
  const checklistService = new SoundChecklistService(libraryService);
  const soundRequestExportService = new SoundRequestExportService(libraryService, assetService, candidateService);
  const snapshotService = new SoundPackSnapshotService(
    libraryService,
    assetService,
    candidateService,
    validationService,
    projectService,
  );
  const diffService = new SoundPackDiffService(snapshotService);
  const changeReviewService = new SoundChangeReviewService(libraryService, diffService, projectService);
  const changeReviewExportService = new SoundChangeReviewExportService(changeReviewService);
  validationService.setChangeReviewService(changeReviewService);
  const projectSoundPackService = new ProjectSoundPackService(libraryService, assetService, candidateService, changeReviewService);
  const changelogService = new SoundPackChangelogService(diffService, changeReviewService);
  const exportCenterService = new ExportCenterService(
    libraryService,
    assetService,
    projectSoundPackService,
    exportService,
    projectService,
    validationService,
    soundRequestExportService,
    snapshotService,
    changelogService,
    changeReviewExportService,
  );
  return {
    rootPath,
    sourcePath,
    libraryService,
    assetService,
    importService,
    projectService,
    usageService,
    candidateService,
    exportService,
    bulkImportService,
    templateService,
    validationService,
    projectSoundPackService,
    workflowService,
    styleGuideService,
    checklistService,
    soundRequestExportService,
    changeReviewService,
    changeReviewExportService,
    snapshotService,
    diffService,
    changelogService,
    exportCenterService,
  };
}

async function importTwoAssets(services: Awaited<ReturnType<typeof createServices>>) {
  const one = join(services.sourcePath, "hit_one.wav");
  const two = join(services.sourcePath, "hit_two.wav");
  await writeFile(one, createSilentWav(11));
  await writeFile(two, createSilentWav(12));
  await services.importService.importFiles([one, two], "copy");
  const assets = await services.assetService.listAssets();
  expect(assets).toHaveLength(2);
  return assets;
}

async function importAssetsWithSameFileName(services: Awaited<ReturnType<typeof createServices>>) {
  const oneDir = join(services.sourcePath, "one");
  const twoDir = join(services.sourcePath, "two");
  await mkdir(oneDir, { recursive: true });
  await mkdir(twoDir, { recursive: true });
  const one = join(oneDir, "same.wav");
  const two = join(twoDir, "same.wav");
  await writeFile(one, createSilentWav(21));
  await writeFile(two, createSilentWav(22));
  await services.importService.importFiles([one, two], "copy");
  const assets = await services.assetService.listAssets({ search: "same.wav" });
  expect(assets).toHaveLength(2);
  return assets;
}

async function saveRights(
  services: Awaited<ReturnType<typeof createServices>>,
  assetId: string,
  input: {
    licenseName?: string;
    author?: string;
    attributionText?: string;
    sourceUrl?: string;
    commercialUseStatus?: "unknown" | "allowed" | "not_allowed" | "check_required";
    creditRequired?: "unknown" | "yes" | "no";
  },
) {
  const context = services.libraryService.requireActive();
  const now = new Date().toISOString();
  context.db.run(
    `
    INSERT INTO asset_rights_metadata (
      asset_id, source_name, source_url, author, license_name, license_url,
      attribution_text, usage_notes, commercial_use_status, credit_required, created_at, updated_at
    )
    VALUES (?, '', ?, ?, ?, '', ?, '', ?, ?, ?, ?)
    ON CONFLICT(asset_id) DO UPDATE SET
      source_url = excluded.source_url,
      author = excluded.author,
      license_name = excluded.license_name,
      attribution_text = excluded.attribution_text,
      commercial_use_status = excluded.commercial_use_status,
      credit_required = excluded.credit_required,
      updated_at = excluded.updated_at
    `,
    [
      assetId,
      input.sourceUrl ?? "",
      input.author ?? "",
      input.licenseName ?? "",
      input.attributionText ?? "",
      input.commercialUseStatus ?? "unknown",
      input.creditRequired ?? "unknown",
      now,
      now,
    ],
  );
}

function createSilentWav(seed: number): Buffer {
  const sampleRate = 8000;
  const samples = 800;
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);
  buffer[buffer.length - 1] = seed;
  return buffer;
}
