import { join } from "node:path";
import { AnalysisAppService } from "./analysis-app-service";
import { AudioFeatureService } from "./audio-feature-service";
import { AudioSimilarityService } from "./audio-similarity-service";
import { AssetService } from "./asset-service";
import { CollectionService } from "./collection-service";
import { ImportService } from "./import-service";
import { LibraryService } from "./library-service";
import { DiagnosticsService } from "./diagnostics-service";
import { DuplicateService } from "./duplicate-service";
import { ExportCenterService } from "./export-center-service";
import { GameProjectService } from "./game-project-service";
import { LibraryManagementService } from "./library-management-service";
import { LoggerService } from "./logger-service";
import { PermanentDeleteService } from "./permanent-delete-service";
import { ProjectSoundPackService } from "./project-sound-pack-service";
import { SettingsService } from "./settings-service";
import { SoundBoardExportService } from "./sound-board-export-service";
import { SoundBoardValidationService } from "./sound-board-validation-service";
import { SoundCandidateService } from "./sound-candidate-service";
import { SoundChecklistService } from "./sound-checklist-service";
import { SoundPackChangelogService } from "./sound-pack-changelog-service";
import { SoundPackDiffService } from "./sound-pack-diff-service";
import { SoundPackSnapshotService } from "./sound-pack-snapshot-service";
import { SoundRequestExportService } from "./sound-request-export-service";
import { SoundStyleGuideService } from "./sound-style-guide-service";
import { SoundUsageBulkImportService } from "./sound-usage-bulk-import-service";
import { SoundUsageService } from "./sound-usage-service";
import { SoundUsageTemplateService } from "./sound-usage-template-service";
import { SoundWorkflowService } from "./sound-workflow-service";
import { TagService } from "./tag-service";
import { TrashService } from "./trash-service";

export interface AppServices {
  libraryService: LibraryService;
  assetService: AssetService;
  tagService: TagService;
  collectionService: CollectionService;
  analysisService: AnalysisAppService;
  audioFeatureService: AudioFeatureService;
  audioSimilarityService: AudioSimilarityService;
  importService: ImportService;
  trashService: TrashService;
  permanentDeleteService: PermanentDeleteService;
  settingsService: SettingsService;
  loggerService: LoggerService;
  diagnosticsService: DiagnosticsService;
  duplicateService: DuplicateService;
  libraryManagementService: LibraryManagementService;
  exportCenterService: ExportCenterService;
  gameProjectService: GameProjectService;
  soundUsageService: SoundUsageService;
  soundCandidateService: SoundCandidateService;
  soundBoardExportService: SoundBoardExportService;
  soundUsageBulkImportService: SoundUsageBulkImportService;
  soundUsageTemplateService: SoundUsageTemplateService;
  soundBoardValidationService: SoundBoardValidationService;
  projectSoundPackService: ProjectSoundPackService;
  soundWorkflowService: SoundWorkflowService;
  soundStyleGuideService: SoundStyleGuideService;
  soundChecklistService: SoundChecklistService;
  soundRequestExportService: SoundRequestExportService;
  soundPackSnapshotService: SoundPackSnapshotService;
  soundPackDiffService: SoundPackDiffService;
  soundPackChangelogService: SoundPackChangelogService;
}

export function createAppServices(userDataPath: string): AppServices {
  const libraryService = new LibraryService(join(userDataPath, "recent-libraries.json"));
  const loggerService = new LoggerService(userDataPath);
  const assetService = new AssetService(libraryService);
  const tagService = new TagService(libraryService);
  const collectionService = new CollectionService(libraryService);
  const analysisService = new AnalysisAppService(libraryService, assetService, tagService);
  const audioFeatureService = new AudioFeatureService(libraryService, assetService, analysisService);
  analysisService.setFeatureService(audioFeatureService);
  const audioSimilarityService = new AudioSimilarityService(libraryService, assetService, audioFeatureService);
  const importService = new ImportService(libraryService, analysisService, loggerService);
  const trashService = new TrashService(libraryService);
  const permanentDeleteService = new PermanentDeleteService(libraryService, assetService);
  const settingsService = new SettingsService(join(userDataPath, "settings.json"));
  const diagnosticsService = new DiagnosticsService(libraryService, loggerService);
  const duplicateService = new DuplicateService(libraryService, assetService, trashService);
  const libraryManagementService = new LibraryManagementService(libraryService, assetService, importService);
  const gameProjectService = new GameProjectService(libraryService);
  const soundUsageService = new SoundUsageService(libraryService, assetService);
  const soundCandidateService = new SoundCandidateService(libraryService, assetService, audioSimilarityService);
  const soundBoardExportService = new SoundBoardExportService(libraryService, assetService, soundCandidateService);
  const soundUsageBulkImportService = new SoundUsageBulkImportService(libraryService, assetService);
  const soundUsageTemplateService = new SoundUsageTemplateService(libraryService, assetService);
  const soundBoardValidationService = new SoundBoardValidationService(libraryService, assetService, soundCandidateService);
  const projectSoundPackService = new ProjectSoundPackService(libraryService, assetService, soundCandidateService);
  const soundWorkflowService = new SoundWorkflowService(libraryService, assetService, soundCandidateService);
  const soundStyleGuideService = new SoundStyleGuideService(libraryService);
  const soundChecklistService = new SoundChecklistService(libraryService);
  const soundRequestExportService = new SoundRequestExportService(libraryService, assetService, soundCandidateService);
  const soundPackSnapshotService = new SoundPackSnapshotService(
    libraryService,
    assetService,
    soundCandidateService,
    soundBoardValidationService,
    gameProjectService,
  );
  const soundPackDiffService = new SoundPackDiffService(soundPackSnapshotService);
  const soundPackChangelogService = new SoundPackChangelogService(soundPackDiffService);
  const exportCenterService = new ExportCenterService(
    libraryService,
    assetService,
    projectSoundPackService,
    soundBoardExportService,
    gameProjectService,
    soundBoardValidationService,
    soundRequestExportService,
    soundPackSnapshotService,
    soundPackChangelogService,
  );

  return {
    libraryService,
    assetService,
    tagService,
    collectionService,
    analysisService,
    audioFeatureService,
    audioSimilarityService,
    importService,
    trashService,
    permanentDeleteService,
    settingsService,
    loggerService,
    diagnosticsService,
    duplicateService,
    libraryManagementService,
    exportCenterService,
    gameProjectService,
    soundUsageService,
    soundCandidateService,
    soundBoardExportService,
    soundUsageBulkImportService,
    soundUsageTemplateService,
    soundBoardValidationService,
    projectSoundPackService,
    soundWorkflowService,
    soundStyleGuideService,
    soundChecklistService,
    soundRequestExportService,
    soundPackSnapshotService,
    soundPackDiffService,
    soundPackChangelogService,
  };
}
