import { useI18n } from "../i18n/useI18n";

export function TrashView({ count }: { count: number }): JSX.Element {
  const { t, format } = useI18n();
  return <div className="asset-count">{count === 0 ? t("trash.empty") : t("trash.count", { count: format.number(count) })}</div>;
}
