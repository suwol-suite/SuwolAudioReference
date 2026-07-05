import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

function readTagName() {
  const argTag = process.argv.find((arg) => arg.startsWith("--tag="))?.split("=")[1];
  if (argTag) {
    return argTag;
  }

  if (process.env.GITHUB_REF_NAME) {
    return process.env.GITHUB_REF_NAME;
  }

  const ref = process.env.GITHUB_REF;
  if (ref?.startsWith("refs/tags/")) {
    return ref.slice("refs/tags/".length);
  }

  return "";
}

const root = process.cwd();
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const version = packageJson.version;
const tagName = readTagName();

if (!tagName || !tagName.startsWith("v")) {
  console.log("release tag check skipped: current ref is not a release tag");
  process.exit(0);
}

const expectedTag = `v${version}`;
if (tagName !== expectedTag) {
  throw new Error(`Release tag ${tagName} does not match package.json version ${version}. Expected ${expectedTag}.`);
}

const releaseNotesPath = join(root, "docs", `release-notes-${version}.md`);
await access(releaseNotesPath);

const readme = await readFile(join(root, "README.md"), "utf8");
if (!readme.includes(`release-notes-${version}.md`) || !readme.includes(expectedTag)) {
  throw new Error(`README.md must reference release-notes-${version}.md and ${expectedTag}.`);
}

console.log(`release tag check ok: ${tagName} matches package.json ${version}`);
