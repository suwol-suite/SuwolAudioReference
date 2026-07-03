import { Save, Trash2 } from "lucide-react";
import { useState } from "react";
import type { ExportOptions, ExportPresetRecord, ExportPresetType } from "../../shared/export-types";
import { useI18n } from "../i18n/useI18n";

interface ExportPresetSelectorProps {
  presets: ExportPresetRecord[];
  currentConfig: Partial<ExportOptions>;
  onApply: (config: Partial<ExportOptions>) => void;
  onSaved: () => Promise<void>;
}

export function ExportPresetSelector({
  presets,
  currentConfig,
  onApply,
  onSaved,
}: ExportPresetSelectorProps): JSX.Element {
  const { t } = useI18n();
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [name, setName] = useState("");

  const selectedPreset = presets.find((preset) => preset.id === selectedPresetId) ?? null;

  async function savePreset(): Promise<void> {
    if (!name.trim()) {
      return;
    }
    await window.suwolAudio.export.presetsSave({
      name: name.trim(),
      type: inferPresetType(currentConfig.target),
      config: currentConfig,
    });
    setName("");
    await onSaved();
  }

  async function deletePreset(): Promise<void> {
    if (!selectedPreset || selectedPreset.builtIn) {
      return;
    }
    await window.suwolAudio.export.presetsDelete(selectedPreset.id);
    setSelectedPresetId("");
    await onSaved();
  }

  return (
    <section className="export-section">
      <h3>{t("export.preset")}</h3>
      <div className="export-row">
        <select value={selectedPresetId} onChange={(event) => setSelectedPresetId(event.target.value)}>
          <option value="">{t("export.presetSelect")}</option>
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.builtIn ? `${preset.name} *` : preset.name}
            </option>
          ))}
        </select>
        <button
          className="secondary-button compact"
          type="button"
          disabled={!selectedPreset}
          onClick={() => selectedPreset && onApply(selectedPreset.config)}
        >
          {t("export.presetApply")}
        </button>
        <button
          className="icon-button"
          type="button"
          disabled={!selectedPreset || selectedPreset.builtIn}
          onClick={() => void deletePreset()}
          title={t("export.presetDelete")}
          aria-label={t("export.presetDelete")}
        >
          <Trash2 size={15} aria-hidden="true" />
        </button>
      </div>
      <div className="export-row">
        <input value={name} placeholder={t("export.presetName")} onChange={(event) => setName(event.target.value)} />
        <button className="secondary-button compact" type="button" disabled={!name.trim()} onClick={() => void savePreset()}>
          <Save size={15} aria-hidden="true" />
          {t("common.save")}
        </button>
      </div>
    </section>
  );
}

function inferPresetType(target: ExportOptions["target"] | undefined): ExportPresetType {
  if (target === "codex_markdown" || target === "codex_json") {
    return "codex_instruction";
  }
  if (target === "unity_manifest") {
    return "unity_manifest";
  }
  if (target === "unreal_json" || target === "unreal_csv") {
    return "unreal_manifest";
  }
  if (target === "monogame_manifest" || target === "monogame_content") {
    return "monogame_manifest";
  }
  if (target === "sound_pack_folder" || target === "sound_pack_metadata") {
    return "sound_pack";
  }
  if (target === "csv_report") {
    return "csv_report";
  }
  return "generic_manifest";
}
