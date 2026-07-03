import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const localeRegistryPath = join(root, "src", "shared", "i18n", "locales.ts");
const supportedLocales = await readSupportedLocales(localeRegistryPath);

const checks = [
  {
    name: "renderer",
    directory: join(root, "src", "renderer", "i18n", "locales"),
    requiredLocales: supportedLocales,
  },
  {
    name: "main",
    directory: join(root, "src", "main", "i18n", "locales"),
    requiredLocales: supportedLocales,
  },
];

const failures = [];

for (const check of checks) {
  const localeMaps = new Map();
  for (const locale of check.requiredLocales) {
    const path = join(check.directory, `${locale}.json`);
    if (!existsSync(path)) {
      failures.push(`${check.name}: missing locale file ${path}`);
      continue;
    }
    localeMaps.set(locale, await readJson(path));
  }

  const base = localeMaps.get("ko");
  if (!base) {
    failures.push(`${check.name}: ko locale is required as the fallback baseline`);
    continue;
  }

  const baseKeys = Object.keys(base).sort();
  for (const [locale, messages] of localeMaps) {
    const keys = Object.keys(messages).sort();
    const missing = baseKeys.filter((key) => !keys.includes(key));
    const extra = keys.filter((key) => !baseKeys.includes(key));
    if (missing.length > 0) {
      failures.push(`${check.name}/${locale}: missing keys ${missing.join(", ")}`);
    }
    if (extra.length > 0) {
      failures.push(`${check.name}/${locale}: extra keys ${extra.join(", ")}`);
    }
    for (const [key, value] of Object.entries(messages)) {
      if (typeof value !== "string") {
        failures.push(`${check.name}/${locale}: ${key} is not a string`);
      } else if (value.trim() === "") {
        failures.push(`${check.name}/${locale}: ${key} is empty`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error(`i18n check failed with ${failures.length} issue(s):`);
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`i18n check ok: locales=${supportedLocales.join(", ")} scopes=${checks.map((check) => check.name).join(", ")}`);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readSupportedLocales(path) {
  const content = await readFile(path, "utf8");
  const match = content.match(/SUPPORTED_LOCALES\s*=\s*\[([^\]]+)\]/m);
  if (!match) {
    throw new Error("Could not read SUPPORTED_LOCALES from locale registry.");
  }
  return Array.from(match[1].matchAll(/["']([^"']+)["']/g), (item) => item[1]);
}
