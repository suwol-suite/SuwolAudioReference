import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { releaseAssetNames, releaseNames } from "./release-names.mjs";

const root = process.cwd();
const args = process.argv.slice(2);
const targetDirectory = resolve(args.find((arg) => !arg.startsWith("--")) ?? join(root, "release-assets"));
const requireAll = args.includes("--require-all");
const requireSignature = args.includes("--require-signature");
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const version = packageJson.version;
const names = releaseNames(version);

async function main() {
  const checksumPath = join(targetDirectory, names.checksums);
  const versionedChecksumPath = join(targetDirectory, names.versionedChecksums);
  const checksumContent = await readRequiredText(checksumPath, names.checksums);
  const versionedChecksumContent = await readRequiredText(versionedChecksumPath, names.versionedChecksums);
  if (checksumContent !== versionedChecksumContent) {
    throw new Error(`${names.checksums} and ${names.versionedChecksums} do not match`);
  }
  if (requireSignature) {
    await assertNonEmpty(join(targetDirectory, names.checksumsSignature), names.checksumsSignature);
    await assertNonEmpty(join(targetDirectory, names.versionedChecksumsSignature), names.versionedChecksumsSignature);
  }

  const lines = checksumContent.split(/\r?\n/).filter(Boolean);
  const included = new Set();
  for (const line of lines) {
    const match = line.match(/^([a-f0-9]{64})  (.+)$/i);
    if (!match) {
      throw new Error(`Invalid checksum line: ${line}`);
    }
    const [, expectedHash, fileName] = match;
    const filePath = join(targetDirectory, fileName);
    await assertNonEmpty(filePath, fileName);
    const actualHash = await sha256File(filePath);
    if (actualHash !== expectedHash.toLowerCase()) {
      throw new Error(`Checksum mismatch for ${fileName}`);
    }
    included.add(fileName);
  }

  if (requireAll) {
    for (const fileName of releaseAssetNames(version)) {
      if (!included.has(fileName)) {
        throw new Error(`${names.checksums} does not include ${fileName}`);
      }
    }
  }

  console.log(`checksums verified: ${lines.length} entries`);
}

async function readRequiredText(path, label) {
  await assertNonEmpty(path, label);
  return readFile(path, "utf8");
}

async function assertNonEmpty(path, label) {
  const stats = await stat(path);
  if (!stats.isFile() || stats.size <= 0) {
    throw new Error(`${label} is missing or empty: ${path}`);
  }
}

async function sha256File(path) {
  const content = await readFile(path);
  return createHash("sha256").update(content).digest("hex");
}

await main();
