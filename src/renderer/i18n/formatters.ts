import type { Locale } from "../../shared/i18n/locales";

export interface I18nFormatters {
  dateTime: (isoValue: string | null | undefined) => string;
  fileSize: (bytes: number | null | undefined) => string;
  duration: (durationMs: number | null | undefined) => string;
  sampleRate: (sampleRate: number | null | undefined) => string;
  bitrate: (bitrate: number | null | undefined) => string;
  channel: (channels: number | null | undefined) => string;
  number: (value: number) => string;
}

export function createFormatters(locale: Locale): I18nFormatters {
  const intlLocale = locale === "ko" ? "ko-KR" : "en-US";
  const numberFormatter = new Intl.NumberFormat(intlLocale);
  const dateTimeFormatter = new Intl.DateTimeFormat(intlLocale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return {
    dateTime(isoValue) {
      if (!isoValue) {
        return "-";
      }
      const date = new Date(isoValue);
      return Number.isNaN(date.getTime()) ? "-" : dateTimeFormatter.format(date);
    },
    fileSize(bytes) {
      if (bytes === undefined || bytes === null || !Number.isFinite(bytes)) {
        return "-";
      }
      if (bytes < 1024) {
        return `${numberFormatter.format(bytes)} B`;
      }
      const units = ["KB", "MB", "GB", "TB"];
      let value = bytes / 1024;
      let unitIndex = 0;
      while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
      }
      return `${formatCompactNumber(value, intlLocale)} ${units[unitIndex]}`;
    },
    duration(durationMs) {
      if (durationMs === undefined || durationMs === null || !Number.isFinite(durationMs)) {
        return "-";
      }
      const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
      const seconds = String(totalSeconds % 60).padStart(2, "0");
      const minutes = Math.floor(totalSeconds / 60) % 60;
      const hours = Math.floor(totalSeconds / 3600);
      if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`;
      }
      return `${minutes}:${seconds}`;
    },
    sampleRate(sampleRate) {
      if (!sampleRate || !Number.isFinite(sampleRate)) {
        return "-";
      }
      return `${new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 1 }).format(sampleRate / 1000)} kHz`;
    },
    bitrate(bitrate) {
      if (!bitrate || !Number.isFinite(bitrate)) {
        return "-";
      }
      return `${numberFormatter.format(Math.round(bitrate / 1000))} kbps`;
    },
    channel(channels) {
      if (!channels || !Number.isFinite(channels)) {
        return "-";
      }
      if (channels === 1) {
        return locale === "ko" ? "모노" : "Mono";
      }
      if (channels === 2) {
        return locale === "ko" ? "스테레오" : "Stereo";
      }
      return locale === "ko" ? `${numberFormatter.format(channels)}채널` : `${numberFormatter.format(channels)} channels`;
    },
    number(value) {
      return numberFormatter.format(value);
    },
  };
}

function formatCompactNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: value >= 10 ? 0 : 1,
  }).format(value);
}
