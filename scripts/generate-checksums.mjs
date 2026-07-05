import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const version = packageJson.version;
const productName = packageJson.build?.productName ?? "Suwol Audio Reference";
const targetDirectory = resolve(process.argv[2] ?? join(root, "release"));
const productSlug = productName.replace(/\s+/g, ".");
const artifactPattern = new RegExp(`^${productSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.${version}\\.(Windows|Linux)\\.x64\\.zip$`);
const platformOrder = new Map([
  ["Windows", 0],
  ["Linux", 1],
]);

async function sha256File(path) {
  const content = await readFile(path);
  return createHash("sha256").update(content).digest("hex");
}

const entries = [];
for (const fileName of await readdir(targetDirectory)) {
  const match = fileName.match(artifactPattern);
  if (!match) {
    continue;
  }
  const path = join(targetDirectory, fileName);
  const fileStats = await stat(path);
  if (fileStats.isFile() && fileStats.size > 0) {
    entries.push({ fileName, platform: match[1], path });
  }
}

entries.sort((left, right) => {
  const byPlatform = (platformOrder.get(left.platform) ?? 99) - (platformOrder.get(right.platform) ?? 99);
  return byPlatform || left.fileName.localeCompare(right.fileName);
});

if (entries.length === 0) {
  throw new Error(`No ${productName} ${version} zip artifacts found in ${targetDirectory}`);
}

const lines = [];
for (const entry of entries) {
  lines.push(`${await sha256File(entry.path)}  ${entry.fileName}`);
}

const checksumPath = join(targetDirectory, "SHA256SUMS.txt");
await writeFile(checksumPath, `${lines.join("\n")}\n`, "utf8");
console.log(`SHA256SUMS created: ${checksumPath}`);
