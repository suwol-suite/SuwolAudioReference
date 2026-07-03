import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APP_KNOWN_ISSUES_DOC,
  APP_LINUX_DISTRIBUTION_DOC,
  APP_RELEASE_NOTES_DOC,
  APP_VERSION,
  APP_WINDOWS_DISTRIBUTION_DOC,
} from "../app-metadata";

const REQUIRED_DOCS = [
  "README.md",
  "docs/manual-qa.md",
  "docs/qa-checklist.md",
  "docs/release-checklist.md",
  APP_RELEASE_NOTES_DOC,
  APP_KNOWN_ISSUES_DOC,
  APP_WINDOWS_DISTRIBUTION_DOC,
  APP_LINUX_DISTRIBUTION_DOC,
];

describe("release readiness docs and checks", () => {
  it("keeps required release documents present and non-empty", () => {
    for (const relativePath of REQUIRED_DOCS) {
      const content = readFileSync(join(process.cwd(), relativePath), "utf8");
      expect(content.trim().length, relativePath).toBeGreaterThan(120);
    }
  });

  it("documents localization, local-only analysis, and release checks in README", () => {
    const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");

    expect(readme).toContain("Korean (`ko`)");
    expect(readme).toContain("English (`en`)");
    expect(readme).toContain("does not use LLMs");
    expect(readme).toContain("cloud");
    expect(readme).toContain("GPL");
    expect(readme).toContain("check:release");
    expect(readme).toContain("windows-distribution.md");
    expect(readme).toContain("linux-distribution.md");
    expect(readme).toContain("GitHub Releases");
    expect(readme).toContain("manual-qa.md");
  });

  it("runs the release artifact checker against a minimal artifact fixture", () => {
    const root = join(tmpdir(), `suwol-release-check-${crypto.randomUUID()}`);
    const productName = "Suwol Audio Reference";
    const packageJson = {
      version: APP_VERSION,
      license: "Apache-2.0",
      build: {
        appId: "work.suwol.audio-reference",
        productName,
      },
    };

    for (const directory of [
      "docs",
      "build",
      "release",
      join("release", "win-unpacked"),
      join("release", "win-unpacked", "resources"),
    ]) {
      mkdirSync(join(root, directory), { recursive: true });
    }

    writeFileSync(join(root, "package.json"), JSON.stringify(packageJson), "utf8");
    for (const relativePath of [
      "README.md",
      "LICENSE",
      "THIRD_PARTY_NOTICES.md",
      `docs/release-notes-${APP_VERSION}.md`,
      "docs/known-issues.md",
      "docs/windows-distribution.md",
      "docs/linux-distribution.md",
      "docs/manual-qa.md",
      "docs/qa-checklist.md",
      "docs/release-checklist.md",
      "build/icon.ico",
      "build/icon.png",
      join("release", "win-unpacked", `${productName}.exe`),
      join("release", "win-unpacked", "resources", "app.asar"),
      join("release", `${productName} ${APP_VERSION} Windows x64.zip`),
    ]) {
      writeFileSync(join(root, relativePath), "fixture", "utf8");
    }

    const output = execFileSync(
      process.execPath,
      [join(process.cwd(), "scripts", "check-release-artifacts.mjs"), root, "--platform", "win"],
      {
        encoding: "utf8",
      },
    );

    expect(output).toContain(`release artifacts ok: ${productName} ${APP_VERSION} (win)`);
  });
});
