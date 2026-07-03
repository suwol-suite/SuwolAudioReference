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
import { LibraryManagementService } from "./library-management-service";
import { LoggerService } from "./logger-service";
import { PermanentDeleteService } from "./permanent-delete-service";
import { SettingsService } from "./settings-service";
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
  const exportCenterService = new ExportCenterService(libraryService, assetService);

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
  };
}
