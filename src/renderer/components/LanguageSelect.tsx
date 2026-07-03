import { useI18n } from "../i18n/useI18n";

export function LanguageSelect({ compact = false }: { compact?: boolean }): JSX.Element {
  const { locale, localeOptions, setLocale, t } = useI18n();

  return (
    <label className={compact ? "language-select compact-language" : "language-select"}>
      <span>{t("language.label")}</span>
      <select value={locale} onChange={(event) => void setLocale(event.target.value as typeof locale)}>
        {localeOptions.map((option) => (
          <option key={option.locale} value={option.locale}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
