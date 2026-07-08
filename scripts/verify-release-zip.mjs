import { spawnSync } from "node:child_process";
import { stat } from "node:fs/promises";
import { basename, resolve } from "node:path";

const zipPath = resolve(process.argv[2] ?? "");
if (!process.argv[2]) {
  throw new Error("Usage: node scripts/verify-release-zip.mjs <zip-path>");
}

const FORBIDDEN = [
  /(^|\/)\.env$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.sqlite(?:3)?$/i,
  /\.db$/i,
  /private/i,
  /revocation/i,
  /(^|\/)node_modules\//i,
  /(^|\/)release\//i,
  /(^|\/)out\//i,
];

const stats = await stat(zipPath);
if (!stats.isFile() || stats.size <= 0) {
  throw new Error(`Zip is missing or empty: ${zipPath}`);
}

const entries = listZipEntries(zipPath);
if (entries.length === 0) {
  throw new Error(`Zip appears empty or could not be listed: ${zipPath}`);
}

for (const entry of entries) {
  const normalized = entry.replace(/\\/g, "/");
  for (const forbidden of FORBIDDEN) {
    if (forbidden.test(normalized)) {
      throw new Error(`Forbidden path in ${basename(zipPath)}: ${entry}`);
    }
  }
}

console.log(`zip verified: ${basename(zipPath)} (${entries.length} entries)`);

function listZipEntries(path) {
  const unzip = spawnSync("unzip", ["-Z1", path], { encoding: "utf8" });
  if (unzip.status === 0) {
    return unzip.stdout.split(/\r?\n/).filter(Boolean);
  }

  if (process.platform === "win32") {
    const command = [
      "$ErrorActionPreference = 'Stop';",
      "Add-Type -AssemblyName System.IO.Compression.FileSystem;",
      "[System.IO.Compression.ZipFile]::OpenRead($env:SUWOL_ZIP_PATH).Entries | ForEach-Object { $_.FullName }",
    ].join(" ");
    const powershell = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
      encoding: "utf8",
      env: { ...process.env, SUWOL_ZIP_PATH: path },
    });
    if (powershell.status === 0) {
      return powershell.stdout.split(/\r?\n/).filter(Boolean);
    }
  }

  throw new Error(`Could not list zip entries for ${path}`);
}
