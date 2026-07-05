import { useEffect, useState } from "react";
import type { SoundProjectStyleGuideInput, SoundProjectStyleGuideRecord } from "../../shared/sound-board-types";
import type { MessageKey } from "../i18n/i18n";
import { useI18n } from "../i18n/useI18n";

const STYLE_FIELDS: Array<{ key: keyof SoundProjectStyleGuideInput; label: MessageKey }> = [
  { key: "overview", label: "soundBoard.style.overview" as MessageKey },
  { key: "uiSoundGuide", label: "soundBoard.style.uiSoundGuide" as MessageKey },
  { key: "sfxGuide", label: "soundBoard.style.sfxGuide" as MessageKey },
  { key: "bgmGuide", label: "soundBoard.style.bgmGuide" as MessageKey },
  { key: "ambienceGuide", label: "soundBoard.style.ambienceGuide" as MessageKey },
  { key: "voiceGuide", label: "soundBoard.style.voiceGuide" as MessageKey },
  { key: "loudnessGuide", label: "soundBoard.style.loudnessGuide" as MessageKey },
  { key: "loopGuide", label: "soundBoard.style.loopGuide" as MessageKey },
  { key: "namingGuide", label: "soundBoard.style.namingGuide" as MessageKey },
  { key: "licenseGuide", label: "soundBoard.style.licenseGuide" as MessageKey },
  { key: "exportGuide", label: "soundBoard.style.exportGuide" as MessageKey },
];

interface ProjectStyleGuidePanelProps {
  guide: SoundProjectStyleGuideRecord | null;
  disabled: boolean;
  onSave: (input: SoundProjectStyleGuideInput) => void;
}

export function ProjectStyleGuidePanel({ guide, disabled, onSave }: ProjectStyleGuidePanelProps): JSX.Element | null {
  const { t } = useI18n();
  const [draft, setDraft] = useState<SoundProjectStyleGuideInput>({});

  useEffect(() => {
    setDraft(guide ?? {});
  }, [guide?.projectId, guide?.updatedAt]);

  if (!guide) {
    return null;
  }

  return (
    <section className="sound-detail-section project-style-guide-panel">
      <div className="sound-panel-header">
        <h3>{t("soundBoard.style.title" as MessageKey)}</h3>
        <button className="primary-button compact" type="button" disabled={disabled} onClick={() => onSave(draft)}>
          {t("common.save")}
        </button>
      </div>
      {STYLE_FIELDS.map((field) => (
        <label key={field.key}>
          {t(field.label)}
          <textarea
            value={(draft[field.key] as string | undefined) ?? ""}
            placeholder={t("soundBoard.style.placeholder" as MessageKey)}
            onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
          />
        </label>
      ))}
    </section>
  );
}
