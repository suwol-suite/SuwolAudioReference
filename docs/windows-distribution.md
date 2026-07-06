# Windows Distribution Guide

This guide describes how to distribute Suwol Audio Reference 0.1.2 on Windows before a code-signing certificate is available. The 0.1.2 release workflow is zip-first.

## Current Artifacts

- Windows zip: `release\Suwol.Audio.Reference.0.1.2.Windows.x64.zip`
- Unpacked app: `release\win-unpacked\Suwol Audio Reference.exe`

Generate the unpacked Windows app with:

```bash
npm.cmd run dist:win:dir
```

Generate the Windows zip with:

```bash
npm.cmd run zip:win
```

Validate release artifacts with:

```bash
npm.cmd run check:release -- --platform win
```

## Zip Distribution

Users download the Windows zip from GitHub Releases, extract it to a writable folder, and run `Suwol Audio Reference.exe` from the extracted `win-unpacked` folder.

An installer is not the primary 0.1.2 Windows release artifact. The GitHub Actions release workflow uploads the Windows/Linux zip files, publishes Linux AppImage/tar.gz assets with signed checksum files, includes Linux updater metadata, and keeps zip hashes in `SHA256SUMS.txt`.

Windows zip builds do not use automatic updates. The Settings Updates tab shows manual GitHub Releases guidance on Windows, and the app does not call `electron-updater` outside packaged Linux AppImage builds.

Recommended user-facing steps:

1. Download `Suwol.Audio.Reference.0.1.2.Windows.x64.zip` from the official GitHub Release.
2. If a checksum file is published, compare the zip SHA-256 hash before running.
3. Extract the zip to a writable folder, for example under the user's Downloads or Tools folder.
4. Run `win-unpacked\Suwol Audio Reference.exe`.
5. Keep the extracted folder together; do not run the executable directly from inside the compressed zip viewer.

## Unsigned Build Notice

The current 0.1.2 build is not code signed. Windows SmartScreen, Microsoft Defender, or browser download checks may warn that the publisher is unknown.

Do not tell users to ignore security warnings blindly. Instead:

- Publish artifacts only from a trusted project-controlled location.
- Publish SHA-256 hashes next to the Windows zip and Linux release artifacts.
- Publish release notes and known issues next to the artifacts.
- Keep source, license, and third-party notices available for review.
- Ask testers to confirm the file name, source, and hash before running the app.
- Ask testers to report the exact warning text if SmartScreen or a browser blocks execution.

Code signing with an OV or EV certificate is a future distribution phase. This Phase 7 work does not implement signing or attempt to bypass SmartScreen reputation checks.

## Local-Only Behavior

Suwol Audio Reference works on local files and local SQLite library data. The app does not call Codex, OpenAI, LLMs, Whisper, cloud analysis services, or cloud backup services.

The app does not edit, transcode, normalize, rename, move, or delete original source audio files as part of import, analysis, similarity, or export. Copy-mode permanent delete is limited to safe library-owned copies under `.suwol-audio/assets/`. Link-mode originals remain outside the library and are not deleted.

The app does not add an app-managed ffmpeg executable or GPL-family runtime package. Electron may include Chromium media codec components as part of the Electron runtime, but Suwol Audio Reference does not invoke ffmpeg or expose conversion features.

## Suggested Release Folder

Keep a release folder outside the repository with:

- `Suwol.Audio.Reference.0.1.2.Windows.x64.zip`
- `Suwol.Audio.Reference.0.1.2.Linux.x64.zip`
- Linux AppImage and tar.gz assets from the GitHub Release, when testing Linux distribution
- `SHA256SUMS.txt`
- `checksums.txt`, `checksums.txt.asc`, and `suwol-release-public-key.asc`
- `docs/release-notes-0.1.2.md`
- `docs/known-issues.md`
- `docs/windows-distribution.md`
- `docs/linux-distribution.md`
- `LICENSE`
- `THIRD_PARTY_NOTICES.md`

Do not include generated QA fixture audio in published release artifacts.
