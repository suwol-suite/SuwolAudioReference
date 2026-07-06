import { Copy } from "lucide-react";
import type { ReleaseChecksumCommand, ReleaseStatus } from "../../shared/release-status-types";
import type { MessageKey } from "../i18n/i18n";
import { useI18n } from "../i18n/useI18n";

interface ChecksumHelpPanelProps {
  status: ReleaseStatus;
}

export function ChecksumHelpPanel({ status }: ChecksumHelpPanelProps): JSX.Element {
  const { t } = useI18n();
  const windowsCommands = status.checksumCommands.filter((command) => command.platform === "windows");
  const linuxCommands = status.checksumCommands.filter((command) => command.platform === "linux");

  return (
    <div className="checksum-help-panel">
      <CommandGroup title={t("updates.windowsManualUpdate")} commands={windowsCommands} />
      <CommandGroup title={t("updates.linuxAppImageAutoUpdate")} commands={linuxCommands} />
      <ul className="release-notes-list">
        <li>{t("updates.checksumsContainHashes")}</li>
        <li>{t("updates.signedChecksumsDescription")}</li>
        <li>{t("updates.publicKeyDescription")}</li>
        <li>{t("updates.checksumManual")}</li>
      </ul>
    </div>
  );
}

export function getChecksumCommandLabelKey(command: ReleaseChecksumCommand): MessageKey {
  return `updates.command.${command.id}` as MessageKey;
}

function CommandGroup({ title, commands }: { title: string; commands: ReleaseChecksumCommand[] }): JSX.Element {
  const { t } = useI18n();
  return (
    <div className="checksum-command-group">
      <h5>{title}</h5>
      {commands.map((command) => (
        <div className="checksum-command-row" key={command.id}>
          <span>{t(getChecksumCommandLabelKey(command))}</span>
          <code>{command.command}</code>
          <button
            className="mini-icon-button"
            type="button"
            title={t("updates.copyCommand")}
            aria-label={t("updates.copyCommand")}
            onClick={() => void copyCommand(command.command)}
          >
            <Copy size={13} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}

async function copyCommand(command: string): Promise<void> {
  await navigator.clipboard?.writeText(command);
}
