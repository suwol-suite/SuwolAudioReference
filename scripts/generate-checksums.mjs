import { createHash } from "node:crypto";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { releaseAssetNames, releaseNames, PRODUCT_NAME } from "./release-names.mjs";

const root = process.cwd();
const args = process.argv.slice(2);
const targetDirectory = resolve(args.find((arg) => !arg.startsWith("--")) ?? join(root, "release"));
const requireAll = args.includes("--require-all");
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const version = packageJson.version;
const names = releaseNames(version);

async function fileExists(path) {
  try {
    const stats = await stat(path);
    return stats.isFile() && stats.size > 0;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function sha256File(path) {
  const content = await readFile(path);
  return createHash("sha256").update(content).digest("hex");
}

const entries = [];
for (const fileName of releaseAssetNames(version)) {
  const path = join(targetDirectory, fileName);
  if (await fileExists(path)) {
    entries.push({ fileName, path });
  } else if (requireAll) {
    throw new Error(`Required release asset is missing for checksums: ${fileName}`);
  }
}

if (entries.length === 0) {
  throw new Error(`No ${PRODUCT_NAME} ${version} release assets found in ${targetDirectory}`);
}

const lines = [];
for (const entry of entries) {
  lines.push(`${await sha256File(entry.path)}  ${entry.fileName}`);
}

const content = `${lines.join("\n")}\n`;
const checksumPath = join(targetDirectory, names.checksums);
const versionedChecksumPath = join(targetDirectory, names.versionedChecksums);

await writeFile(checksumPath, content, "utf8");
await writeFile(versionedChecksumPath, content, "utf8");
await access(checksumPath);
await access(versionedChecksumPath);

console.log(`checksums created: ${checksumPath}`);
console.log(`versioned checksums created: ${versionedChecksumPath}`);
for (const entry of entries) {
  console.log(`checksum asset: ${basename(entry.path)}`);
}
