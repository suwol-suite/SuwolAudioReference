import { access, readdir, readFile, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const root = process.cwd();
const args = process.argv.slice(2);
const explicitDirectory = args.find((arg) => !arg.startsWith("--"));
const targetDirectory = resolve(explicitDirectory ?? join(root, "release"));
const requireSignature = args.includes("--require-signature");

async function main() {
  if (!(await exists(targetDirectory))) {
    if (process.platform === "win32") {
      console.log(`linux updater artifact check skipped on Windows: ${targetDirectory}`);
      return;
    }
    throw new Error(`Linux updater artifact directory is missing: ${targetDirectory}`);
  }

  const files = await readdir(targetDirectory);
  if (process.platform === "win32" && !files.some((file) => file.endsWith(".AppImage"))) {
    console.log(`linux updater artifact check skipped on Windows: no AppImage in ${targetDirectory}`);
    return;
  }
  const appImage = single(files, (file) => file.endsWith(".AppImage"), "Linux AppImage");
  const tarball = single(files, (file) => file.endsWith(".tar.gz"), "Linux tar.gz");
  const latestLinux = "latest-linux.yml";
  const checksums = "checksums.txt";

  await assertFile(appImage, "Linux AppImage");
  await assertFile(tarball, "Linux tar.gz");
  await assertFile(latestLinux, "latest-linux.yml");
  await assertFile(checksums, "checksums.txt");
  if (requireSignature) {
    await assertFile("checksums.txt.asc", "checksums.txt.asc");
  }

  const latestLinuxContent = await readFile(join(targetDirectory, latestLinux), "utf8");
  if (!latestLinuxContent.includes(appImage)) {
    throw new Error(`latest-linux.yml does not reference ${appImage}`);
  }
  if (!/sha512:\s*\S+/m.test(latestLinuxContent)) {
    throw new Error("latest-linux.yml does not contain a sha512 entry");
  }
  if (!/version:\s*\S+/m.test(latestLinuxContent)) {
    throw new Error("latest-linux.yml does not contain a version entry");
  }

  const checksumContent = await readFile(join(targetDirectory, checksums), "utf8");
  for (const artifact of [appImage, tarball]) {
    if (!checksumContent.split(/\r?\n/).some((line) => line.endsWith(`  ${artifact}`))) {
      throw new Error(`checksums.txt does not contain ${artifact}`);
    }
  }

  for (const blockmap of files.filter((file) => file.endsWith(".blockmap"))) {
    await assertFile(blockmap, `${blockmap} blockmap`);
  }

  console.log(`linux updater artifacts ok: ${basename(targetDirectory)}`);
  console.log(`appimage: ${appImage}`);
  console.log(`tarball: ${tarball}`);
  console.log(`metadata: ${latestLinux}`);
}

function single(files, predicate, label) {
  const matches = files.filter(predicate);
  if (matches.length === 0) {
    throw new Error(`${label} is missing in ${targetDirectory}`);
  }
  if (matches.length > 1) {
    throw new Error(`${label} is ambiguous in ${targetDirectory}: ${matches.join(", ")}`);
  }
  return matches[0];
}

async function assertFile(fileName, label) {
  const path = join(targetDirectory, fileName);
  await access(path);
  const fileStats = await stat(path);
  if (!fileStats.isFile() || fileStats.size <= 0) {
    throw new Error(`${label} is missing or empty: ${path}`);
  }
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

await main();
