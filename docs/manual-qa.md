# Suwol Audio Reference Manual QA Guide

Use this guide for a human smoke pass before publishing a Windows 0.1.0 build. The goal is to confirm that a real user can install, open, import, listen, organize, export, and recover from common errors without the app modifying original audio files.

Record the tester name, Windows version, package type, tested artifact path, date, fixture folder, and final pass/fail result in the release notes.

## Before You Start

- Close any running Suwol Audio Reference windows before launching a packaged build.
- Prefer `release\win-unpacked\Suwol Audio Reference.exe` for the full Windows manual pass.
- Extract `release\Suwol Audio Reference 0.1.0 Windows x64.zip` to a normal writable folder before running the executable from the extracted `win-unpacked` folder.
- Use the GitHub Actions Linux artifact or GitHub Release Linux zip for Linux smoke on a Linux test machine.
- Keep fixture audio outside the repository, for example under `C:\Temp\suwol-audio-phase6-fixtures`.
- Do not run multiple GUI smoke commands at the same time.

## Duplicate Window Check

The app now requests a single-instance lock. Verify this behavior once per release candidate:

1. Launch the packaged app once.
2. Launch the same packaged executable again.
3. Confirm no second main window remains open.
4. Confirm the existing window is focused or restored if it was minimized.
5. Close the app and reopen it normally.

If a duplicate window appears, stop GUI smoke, record the exact command or executable used, and inspect `scripts/dev.mjs`, `src/main/main.ts`, and the local app log.

## A. First Launch

1. Launch the app.
2. Confirm the window title is `Suwol Audio Reference`.
3. Confirm the app icon appears in the window/taskbar.
4. Open Settings, then About.
5. Confirm version `0.1.0`, license `Apache-2.0`, release notes path, known issues path, and Windows distribution guide path are visible.
6. Confirm Korean is usable as the default language.
7. Switch to English.
8. Close and reopen the app, then confirm the selected language is preserved.

## B. Empty Library

1. Create a library under a normal ASCII path.
2. Create or open a library under a path containing Korean characters.
3. Confirm the recent library list shows the library.
4. Close and reopen the app.
5. Reopen the recent library and confirm the asset list is still empty and stable.

## C. Import

1. Import several `.wav` files from the fixture folder.
2. Import files with Korean names.
3. Import files with spaces and special characters.
4. Import a duplicate file and confirm it is skipped or reported as duplicate.
5. Import a damaged `.wav` and confirm the batch remains usable.
6. Import unsupported manageable files such as `.json` or `.zip` and confirm they are skipped or managed according to the current allowlist.
7. Confirm the import summary reports requested, successful, duplicate, unsupported, analysis-failed, and failed counts when applicable.
8. Confirm copy-mode files are stored under `.suwol-audio/assets/`.
9. Confirm link-mode source files remain in their original location.

## D. Playback

1. Play a WAV file from the asset list.
2. Toggle playback with `Space`.
3. Play the selected asset with `Enter`.
4. Stop playback or clear selection with `Esc`.
5. Enable Quick Preview and confirm short UI/SFX candidates can auto-play.
6. Confirm long ambience/music candidates do not auto-play unless settings allow it.
7. Select two files and use A/B compare.
8. Move or rename a link-mode source file outside the app, then confirm missing/unplayable state is shown instead of a crash.

## E. Analysis

1. Confirm waveform preview renders for supported audio.
2. Confirm suggested tags appear as suggestions only.
3. Apply a suggested tag manually and confirm it is added only after the click.
4. Confirm feature vector state appears for analyzed assets.
5. Open Similar Sounds and confirm candidates show scores, reason chips, class, duration, tags, RMS/peak, and duplicate labels when applicable.
6. Confirm loop score and silence/peak/RMS indicators appear where analysis data exists.
7. Re-run analysis for one selected asset and confirm the UI remains responsive.

## F. Organize

1. Add and remove a manual tag.
2. Apply a suggested tag.
3. Set and clear ratings with `1` to `5` and `0`.
4. Toggle favorite with `F`.
5. Create a collection and add selected assets.
6. Select multiple assets and apply a batch action.
7. Confirm user-created names, memos, tags, collections, paths, and titles are not auto-translated when switching language.

## G. Library Management

1. Run diagnostics.
2. Confirm database integrity is `ok`.
3. Confirm migration version, asset count, missing files, missing analysis, trashed assets, duplicate hashes, and import warnings are visible.
4. Create a missing-file case and confirm diagnostics reports it.
5. Relink one missing file.
6. Run duplicate manager and confirm metadata merge/trash actions do not permanently delete files.
7. Run backup preview and backup execution, then inspect `backup-manifest.json`.
8. Export metadata as JSON and CSV.
9. Export sidecar metadata for selected assets.
10. Scan an import source folder and confirm the summary.

## H. Export Center

1. Export selected assets as Codex Markdown.
2. Export selected assets as Codex JSON context.
3. Export current filter results as generic manifest JSON.
4. Export Unity manifest JSON.
5. Export Unreal JSON or CSV.
6. Export MonoGame JSON and content list.
7. Export sound pack metadata only.
8. Export a sound pack folder and confirm audio is copied into export folders only.
9. Confirm warnings appear for missing files, unknown license metadata, credit-required assets without attribution, absolute paths, duplicate keys, and target collisions.
10. Confirm original source audio files are never renamed, edited, transcoded, moved, or deleted.

## I. Trash Safety

1. Move a copy-mode asset to trash and restore it.
2. Move a link-mode asset to trash and restore it.
3. Permanently delete a copy-mode asset and confirm only the safe library copy is deleted.
4. Permanently delete a link-mode asset and confirm the original source file remains.
5. Confirm permanent delete refuses unsafe paths outside `.suwol-audio/assets/`.

## J. Logs And Error Handling

1. Open Settings > Library and click Open Log Folder.
2. Run diagnostics.
3. Click Show Recent Logs and confirm recent log lines appear.
4. Trigger safe failure cases such as corrupted audio, unsupported files, missing linked files, export target collision, and backup target collision.
5. Confirm raw stack traces are not shown directly in the normal UI.
6. If an ErrorBoundary fallback is triggered during a development-only test, confirm Retry and Open Log Folder are available.

## Large Fixture Pass

Generate a large local fixture set outside the repository:

```bash
npm.cmd run fixtures:large -- C:\Temp\suwol-audio-1000 --sfx 350 --ui 350 --loops 150 --ambience 150
```

Then verify:

- Import a 100-file subset.
- Import a 1,000-file set when time allows.
- Search, filter, sort, smart folders, and Load More remain responsive.
- Similar Sounds returns candidates without blocking the app.
- Export Center previews large selections without modifying source files.
- Diagnostics and backup remain usable after the large import.
