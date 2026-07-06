import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
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
      engines: {
        node: ">=24.0.0",
      },
      build: {
        appId: "work.suwol.audio-reference",
        productName,
        win: {
          target: ["dir"],
        },
        linux: {
          target: ["dir", "AppImage", "tar.gz"],
        },
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
    const windowsZipName = `Suwol.Audio.Reference.${APP_VERSION}.Windows.x64.zip`;
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
      join("release", windowsZipName),
    ]) {
      writeFileSync(join(root, relativePath), "fixture", "utf8");
    }
    const fixtureHash = createHash("sha256").update("fixture").digest("hex");
    writeFileSync(join(root, "release", "SHA256SUMS.txt"), `${fixtureHash}  ${windowsZipName}\n`, "utf8");

    const output = execFileSync(
      process.execPath,
      [join(process.cwd(), "scripts", "check-release-artifacts.mjs"), root, "--platform", "win", "--require-checksums"],
      {
        encoding: "utf8",
      },
    );

    expect(output).toContain(`release artifacts ok: ${productName} ${APP_VERSION} (win)`);
  });

  it("checks release tags against package version", () => {
    const output = execFileSync(
      process.execPath,
      [join(process.cwd(), "scripts", "check-release-tag.mjs"), `--tag=v${APP_VERSION}`],
      {
        encoding: "utf8",
      },
    );

    expect(output).toContain(`release tag check ok: v${APP_VERSION}`);
  });

  it("accepts URL-encoded AppImage references in Linux updater metadata", () => {
    const root = join(tmpdir(), `suwol-linux-updater-check-${crypto.randomUUID()}`);
    const appImageName = `Suwol Audio Reference-${APP_VERSION}.AppImage`;
    const tarballName = `suwol-audio-reference-${APP_VERSION}.tar.gz`;

    mkdirSync(root, { recursive: true });
    for (const relativePath of [appImageName, `${appImageName}.blockmap`, tarballName, "checksums.txt"]) {
      writeFileSync(join(root, relativePath), "fixture", "utf8");
    }
    writeFileSync(
      join(root, "latest-linux.yml"),
      [
        `version: ${APP_VERSION}`,
        "files:",
        `  - url: https://github.com/suwol-suite/SuwolAudioReference/releases/download/v${APP_VERSION}/${encodeURIComponent(appImageName)}`,
        "    sha512: fixture-sha512",
        "    size: 7",
        `path: ./${encodeURIComponent(appImageName)}`,
        "sha512: fixture-sha512",
      ].join("\n"),
      "utf8",
    );

    const checksumContent = [
      `${createHash("sha256").update("fixture").digest("hex")}  ${appImageName}`,
      `${createHash("sha256").update("fixture").digest("hex")}  ${tarballName}`,
      "",
    ].join("\n");
    writeFileSync(join(root, "checksums.txt"), checksumContent, "utf8");

    const output = execFileSync(process.execPath, [join(process.cwd(), "scripts", "check-linux-updater-artifacts.mjs"), root], {
      encoding: "utf8",
    });

    expect(output).toContain("linux updater artifacts ok");
    expect(output).toContain(`appimage: ${appImageName}`);
  });

  it("documents the 0.1.3 release recovery and project export scope", () => {
    const notes = readFileSync(join(process.cwd(), APP_RELEASE_NOTES_DOC), "utf8");

    expect(notes).toContain("release-flow recovery");
    expect(notes).toContain("Linux AppImage auto-update readiness");
    expect(notes).toContain("Game Project");
    expect(notes).toContain("Sound Usage Board");
    expect(notes).toContain("Project Sound Pack");
    expect(notes).toContain("Project Manifest");
    expect(notes).toContain("Project Missing Report");
    expect(notes).toContain("Project Codex Instruction");
    expect(notes).toContain("Export Center game-project source");
    expect(notes).toContain("Local export history");
    expect(notes).toContain("121 tests passed");
  });
});
