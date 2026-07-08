# Windows Distribution Guide

This guide describes how to distribute Suwol Audio Reference 0.1.5 on Windows before a code-signing certificate is available. The 0.1.5 release workflow is zip-first on Windows.

## Current Artifacts

- Windows zip: `release\SuwolAudioReference-0.1.5-win-x64.zip`
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

An installer is not the primary 0.1.5 Windows release artifact. The GitHub Actions release workflow uploads Windows/Linux zip files, Linux AppImage metadata, macOS arm64 DMG/zip files, signed checksum files, and the public release key.

Windows zip builds do not use automatic updates. The Settings Updates tab shows manual GitHub Releases guidance on Windows, expected release asset names for the current version, checksum help, and the app does not call `electron-updater` outside packaged Linux AppImage builds.

Recommended user-facing steps:

1. Download `SuwolAudioReference-0.1.5-win-x64.zip` from the official GitHub Release.
2. Download `checksums.txt`, `checksums.txt.asc`, and `suwol-release-public-key.asc`, then verify the signed checksum file before running.
3. Extract the zip to a writable folder, for example under the user's Downloads or Tools folder.
4. Run `win-unpacked\Suwol Audio Reference.exe`.
5. Keep the extracted folder together; do not run the executable directly from inside the compressed zip viewer.

## Unsigned Build Notice

The current 0.1.5 Windows zip build is not code signed. Windows SmartScreen, Microsoft Defender, or browser download checks may warn that the publisher is unknown.

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

- `SuwolAudioReference-0.1.5-win-x64.zip`
- `SuwolAudioReference-0.1.5-linux-x64.zip`
- `SuwolAudioReference-0.1.5-linux-x64.AppImage`
- `latest-linux.yml`
- `SuwolAudioReference-0.1.5-mac-arm64.dmg`
- `SuwolAudioReference-0.1.5-mac-arm64.zip`
- `latest-mac.yml`
- `SuwolAudioReference-0.1.5-checksums.txt`
- `SuwolAudioReference-0.1.5-checksums.txt.asc`
- `checksums.txt`, `checksums.txt.asc`, and `suwol-release-public-key.asc`
- `docs/release-notes-0.1.5.md`
- `docs/known-issues.md`
- `docs/windows-distribution.md`
- `docs/linux-distribution.md`
- `LICENSE`
- `THIRD_PARTY_NOTICES.md`

Do not include generated QA fixture audio in published release artifacts.
