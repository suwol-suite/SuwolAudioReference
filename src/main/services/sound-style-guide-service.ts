import { randomUUID } from "node:crypto";
import type {
  SoundProjectStyleGuideInput,
  SoundProjectStyleGuideRecord,
} from "../../shared/sound-board-types";
import { GameProjectService } from "./game-project-service";
import type { LibraryService } from "./library-service";
import { normalizeOptionalText } from "./sound-board-helpers";

interface StyleGuideRow {
  id: string;
  project_id: string;
  overview: string;
  ui_sound_guide: string;
  sfx_guide: string;
  bgm_guide: string;
  ambience_guide: string;
  voice_guide: string;
  loudness_guide: string;
  loop_guide: string;
  naming_guide: string;
  license_guide: string;
  export_guide: string;
  created_at: string;
  updated_at: string;
}

export class SoundStyleGuideService {
  private readonly projectService: GameProjectService;

  constructor(private readonly libraryService: LibraryService) {
    this.projectService = new GameProjectService(libraryService);
  }

  get(projectId: string): SoundProjectStyleGuideRecord {
    this.requireProject(projectId);
    const context = this.libraryService.requireActive();
    const row = context.db.get<StyleGuideRow>("SELECT * FROM sound_project_style_guides WHERE project_id = ?", [
      projectId,
    ]);
    return row ? mapStyleGuideRow(row) : createEmptyStyleGuide(projectId);
  }

  update(projectId: string, input: SoundProjectStyleGuideInput): SoundProjectStyleGuideRecord {
    this.requireProject(projectId);
    const current = this.get(projectId);
    const context = this.libraryService.requireActive();
    const now = new Date().toISOString();
    const id = current.id || randomUUID();
    context.db.run(
      `
      INSERT INTO sound_project_style_guides (
        id, project_id, overview, ui_sound_guide, sfx_guide, bgm_guide,
        ambience_guide, voice_guide, loudness_guide, loop_guide, naming_guide,
        license_guide, export_guide, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET
        overview = excluded.overview,
        ui_sound_guide = excluded.ui_sound_guide,
        sfx_guide = excluded.sfx_guide,
        bgm_guide = excluded.bgm_guide,
        ambience_guide = excluded.ambience_guide,
        voice_guide = excluded.voice_guide,
        loudness_guide = excluded.loudness_guide,
        loop_guide = excluded.loop_guide,
        naming_guide = excluded.naming_guide,
        license_guide = excluded.license_guide,
        export_guide = excluded.export_guide,
        updated_at = excluded.updated_at
      `,
      [
        id,
        projectId,
        normalizeOptionalText(input.overview ?? current.overview),
        normalizeOptionalText(input.uiSoundGuide ?? current.uiSoundGuide),
        normalizeOptionalText(input.sfxGuide ?? current.sfxGuide),
        normalizeOptionalText(input.bgmGuide ?? current.bgmGuide),
        normalizeOptionalText(input.ambienceGuide ?? current.ambienceGuide),
        normalizeOptionalText(input.voiceGuide ?? current.voiceGuide),
        normalizeOptionalText(input.loudnessGuide ?? current.loudnessGuide),
        normalizeOptionalText(input.loopGuide ?? current.loopGuide),
        normalizeOptionalText(input.namingGuide ?? current.namingGuide),
        normalizeOptionalText(input.licenseGuide ?? current.licenseGuide),
        normalizeOptionalText(input.exportGuide ?? current.exportGuide),
        current.createdAt || now,
        now,
      ],
    );
    return this.get(projectId);
  }

  createMarkdown(projectId: string): string {
    const project = this.requireProject(projectId);
    return renderStyleGuideMarkdown(project.name, this.get(projectId));
  }

  isEmpty(projectId: string): boolean {
    return isStyleGuideEmpty(this.get(projectId));
  }

  private requireProject(projectId: string) {
    const project = this.projectService.getProject(projectId);
    if (!project) {
      throw new Error("PROJECT_NOT_FOUND");
    }
    return project;
  }
}

export function renderStyleGuideMarkdown(projectName: string, guide: SoundProjectStyleGuideRecord): string {
  const sections: Array<[string, string]> = [
    ["Overview", guide.overview],
    ["UI Sound Guide", guide.uiSoundGuide],
    ["SFX Guide", guide.sfxGuide],
    ["BGM Guide", guide.bgmGuide],
    ["Ambience Guide", guide.ambienceGuide],
    ["Voice Guide", guide.voiceGuide],
    ["Loudness Guide", guide.loudnessGuide],
    ["Loop Guide", guide.loopGuide],
    ["Naming Guide", guide.namingGuide],
    ["License Guide", guide.licenseGuide],
    ["Export Guide", guide.exportGuide],
  ];
  return [
    "# Project Sound Style Guide",
    "",
    `Project: ${escapeMarkdown(projectName)}`,
    "",
    ...sections.flatMap(([title, body]) => [`## ${title}`, "", body.trim() || "TODO", ""]),
  ].join("\n");
}

export function isStyleGuideEmpty(guide: SoundProjectStyleGuideRecord): boolean {
  return [
    guide.overview,
    guide.uiSoundGuide,
    guide.sfxGuide,
    guide.bgmGuide,
    guide.ambienceGuide,
    guide.voiceGuide,
    guide.loudnessGuide,
    guide.loopGuide,
    guide.namingGuide,
    guide.licenseGuide,
    guide.exportGuide,
  ].every((value) => !value.trim());
}

function createEmptyStyleGuide(projectId: string): SoundProjectStyleGuideRecord {
  const now = new Date().toISOString();
  return {
    id: "",
    projectId,
    overview: "",
    uiSoundGuide: "",
    sfxGuide: "",
    bgmGuide: "",
    ambienceGuide: "",
    voiceGuide: "",
    loudnessGuide: "",
    loopGuide: "",
    namingGuide: "",
    licenseGuide: "",
    exportGuide: "",
    createdAt: now,
    updatedAt: now,
  };
}

function mapStyleGuideRow(row: StyleGuideRow): SoundProjectStyleGuideRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    overview: row.overview,
    uiSoundGuide: row.ui_sound_guide,
    sfxGuide: row.sfx_guide,
    bgmGuide: row.bgm_guide,
    ambienceGuide: row.ambience_guide,
    voiceGuide: row.voice_guide,
    loudnessGuide: row.loudness_guide,
    loopGuide: row.loop_guide,
    namingGuide: row.naming_guide,
    licenseGuide: row.license_guide,
    exportGuide: row.export_guide,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function escapeMarkdown(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
