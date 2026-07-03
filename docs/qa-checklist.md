# Suwol Audio Reference QA Checklist

Use this checklist before an MVP release candidate is accepted. Record the tested commit, Windows version, package type, and tester name in the release notes.

## Automated Gates

- `npm.cmd run typecheck` passes.
- `npm.cmd test` passes.
- `npm.cmd audit` passes or every finding has a documented release decision.
- `npm.cmd run check:i18n` passes.
- `npm.cmd run build` passes.
- `npm.cmd run smoke:production-entry` passes after build.
- `npm.cmd run pack` passes.
- `npm.cmd run smoke:packaged-paths` passes after pack.
- `npm.cmd run dist:win:dir` passes when publishing a Windows zip.
- `npm.cmd run zip:win` passes after the Windows unpacked build is created.
- `npm.cmd run check:release -- --platform win` passes after the Windows zip is created.
- The GitHub Actions Linux job passes `npm run dist:linux:dir`, `npm run zip:linux`, and `npm run check:release -- --platform linux`.

## Fixture Set

Generate the local fixture set:

```bash
npm.cmd run fixtures:audio -- C:\Temp\suwol-audio-fixtures
```

The fixture set should include short sounds, ambience, voice-like audio, loop-like audio, duplicate content, Korean filenames, spaces, symbols, a long filename, a damaged `.wav`, and unsupported files.

For large-library QA, generate a temporary larger set:

```bash
npm.cmd run fixtures:large -- C:\Temp\suwol-audio-large-fixtures --sfx 350 --ui 350 --loops 150 --ambience 150
```

Do not commit generated fixture audio.

## GUI Smoke Safety

- Close existing app windows before starting manual GUI smoke.
- Do not run `npm.cmd run dev`, the unpacked executable, and another packaged copy at the same time.
- Confirm a second launch of `release\win-unpacked\Suwol Audio Reference.exe` focuses or restores the existing window instead of keeping a duplicate main window open.
- If duplicate windows appear, stop the GUI pass and record the exact command or executable path before continuing.
- Development HMR reloads are acceptable, but HMR must not create a new `BrowserWindow`.

## Library And Path Coverage

- Create a library under a normal ASCII path.
- Create a library under a path containing Korean characters.
- Create a library under a path containing spaces.
- Create a library under a path containing brackets or symbols.
- Reopen the app and confirm the recent library entry works.
- Back up the library by copying the whole library root, including `.suwol-audio`, then open the copy.

## Import Coverage

- Import supported audio files in copy mode.
- Import supported audio files in link mode.
- Import a duplicate file and confirm it is skipped.
- Import unsupported files and confirm they are skipped without failing the batch.
- Import a damaged audio file and confirm the asset flow remains stable.
- Import multiple files at once and confirm the import summary counts requested, successful, duplicate, unsupported, analysis failed, and failed files.
- Confirm copy-mode files are present under `.suwol-audio/assets/`.
- Confirm link-mode source files remain outside the library storage folder.

## Asset Workflow

- Move through the list with arrow keys.
- Play the selected asset with `Enter`.
- Toggle playback with `Space`.
- Stop playback and clear selection with `Esc`.
- Toggle favorite with `F`.
- Set ratings with `1`-`5` and clear rating with `0`.
- Focus search with `Ctrl+F`.
- Select all visible assets with `Ctrl+A`.
- Move selected assets to trash with `Delete` and confirm the prompt.
- Search by filename.
- Filter by favorite, tag, collection, and trashed state.
- Select multiple assets and apply a batch action.
- Edit memo, rating, and favorite state in the inspector.
- Add and remove tags.
- Add and remove collection links.
- Apply suggested analysis tags and confirm they are not created until applied.
- Play audio from the browser and inspector workflow.
- Use A/B repeat basics.
- Use A/B compare with two selected assets.
- Select three or more assets and move to the next/previous A/B pair.
- Toggle loudness match and confirm playback volume changes without changing source files.
- Add a quick tag from the batch action bar and confirm duplicate tag links are not created.
- Confirm selected assets are visually distinct from the currently playing asset.
- Confirm list/grid rows expose selection state with keyboard navigation.
- Confirm the asset browser loads an initial page and the Load More control appends additional assets.
- Confirm search/filter changes reset the loaded page and do not keep stale selections.
- Confirm the no-results empty state appears when filters match nothing.
- Confirm toast feedback appears after import, batch action, inspector save, and export completion.
- Confirm risky actions use the modal confirmation dialog instead of a raw browser confirm.

## Quick Preview And Smart Folders

- Confirm Quick Preview is off by default.
- Enable Quick Preview in settings.
- Enable auto-play short sounds and confirm short UI/SFX candidates auto-play when selected.
- Confirm music, ambience, and voice candidates do not auto-play by default.
- Change auto-play max duration and confirm the threshold is respected.
- Confirm selection changes stop previous playback when the setting is enabled.
- Open Recent Playback smart folder after playing files.
- Open Loop Candidate smart folder.
- Open Unplayable smart folder after forcing a playback error or importing unsupported manageable assets.
- Confirm waveform states for ready, loading/missing, placeholder, and unplayable assets.

## Trash And Delete Safety

- Move a copy-mode asset to trash and restore it.
- Move a link-mode asset to trash and restore it.
- Permanently delete a copy-mode asset and confirm the library copy is removed.
- Permanently delete a link-mode asset and confirm the original source file remains.
- Confirm permanent delete refuses unsafe paths outside `.suwol-audio/assets/`.

## Localization

- Start with Korean as the default language.
- Switch to English in settings.
- Restart the app and confirm the selected language persists.
- Confirm Electron menus and dialogs use the selected language.
- Run `npm.cmd run check:i18n` and confirm renderer/main ko/en keys match.
- Confirm suggested tag labels render in the selected language when a `tagKey` exists.
- Confirm user-created names are preserved as entered.
- Confirm filenames, paths, user-created tags, collections, memos, rights fields, asset titles, preset names, and entered export goals are not auto-translated.
- Confirm adding a future language means adding locale JSON files and registering the locale, without changing feature code.

## Diagnostics

- Run library diagnostics from settings.
- Confirm database integrity reports `ok`.
- Confirm missing files, missing analysis, trashed assets, duplicate hashes, and import warnings display.
- Confirm the log path points to the local app data log file.
- Confirm diagnostics does not mutate library data.
- Confirm Phase 3 diagnostics show migration version, asset count, orphan rows, waveform missing count, duplicate groups, and unplayable assets.
- Delete or move a copy-mode library file outside the app, run missing detection, and confirm the missing file is shown.
- Relink a single missing file and confirm playback/import metadata recovers.
- Run bulk relink preview against a folder with matching filenames and confirm candidates are shown before apply.
- Create or simulate a duplicate group and confirm duplicate manager can merge metadata into the kept asset.
- Move duplicate assets to trash and confirm no permanent file deletion happens automatically.
- Create a library backup and inspect `backup-manifest.json`.
- Run restore preview against a backup folder.
- Export metadata as JSON and CSV.
- Confirm metadata export does not copy original audio files.
- Rename a tag and confirm asset links remain.
- Merge tags and confirm duplicate asset-tag links are not created.
- Delete unused tags.
- Rename a collection and confirm asset links remain.
- Delete empty collections and confirm assets are not deleted.
- Add an import source folder, scan it, and confirm new/duplicate/unsupported summary.
- Export sidecar metadata for selected assets.

## Export Center

- Open Export Center from the main toolbar.
- Open Export Center from the selected-asset batch action bar.
- Export selected assets as a Codex instruction Markdown file.
- Export selected assets as a Codex JSON context file.
- Export a collection as a Codex instruction Markdown file.
- Export the current filter result as generic game audio manifest JSON.
- Export a tag as Unity manifest JSON.
- Export a smart folder as Unreal manifest JSON and CSV.
- Export selected assets as MonoGame manifest JSON and content list text.
- Export sound pack metadata JSON without copying audio files.
- Export a sound pack folder with audio copied into category folders.
- Confirm export preview lists planned files before export.
- Confirm export type descriptions match the selected output type.
- Confirm missing files block export with an error.
- Confirm unsupported playback appears as a warning.
- Confirm duplicate engine keys receive suffixes and a warning.
- Confirm duplicate output file names receive suffixes and a warning.
- Confirm unknown license metadata appears as a warning.
- Confirm credit-required assets warn when attribution text is empty.
- Confirm BGM/ambience assets that are not loopable warn before export.
- Confirm including absolute paths shows a privacy warning.
- Confirm warning acknowledgement is required before running an export with warnings.
- Confirm export progress appears while preview/export work is running.
- Confirm export summary shows output path and the output location button works.
- Confirm export folder collision is reported before sound pack export.
- Enter source/license/credit metadata in the inspector, save it, change selection, and confirm it reloads.
- Save an export preset, apply it, then delete it.
- Confirm built-in export presets appear and cannot be deleted.
- Export files with Korean filenames.
- Export files with spaces and special characters in filenames.
- Confirm original source audio files are not renamed, moved, edited, transcoded, or deleted.
- Confirm Unity/Unreal/MonoGame exports do not modify engine project folders directly.

## Phase 5A UI Polish

- Open Settings and confirm General, Playback, Library, Shortcuts, and About tabs work.
- Open the shortcut help overlay with `?`.
- Confirm global shortcuts are ignored while an input, textarea, select, or editable field has focus.
- Confirm the inspector sections can be collapsed and expanded.
- Confirm file name, path, and ID copy buttons show feedback.
- Confirm rights metadata save shows feedback and reloads after changing selection.
- Confirm Library Management sections show loading/progress and empty states.
- Confirm missing-file, duplicate, and import-source empty states are readable.
- Confirm keyboard focus outlines remain visible on buttons, list rows, and dialog controls.
- Confirm icon-only buttons have title and aria-label text.
- Browse a library with at least 1,000 assets and confirm scrolling, selection, filtering, and Load More remain responsive.

## Phase 5B Analysis And Similarity

- Import several WAV fixtures and confirm feature analysis is created without using ffmpeg, cloud services, or source-file edits.
- Open the inspector and confirm Similar Sounds loads candidates with score, label, duration, class, tags, RMS/peak, and reason chips.
- Confirm duplicate `content_hash` files are labelled as duplicates, not just similar candidates.
- Confirm Similar Sounds play buttons are disabled for missing or unplayable files.
- Add a similar candidate to A/B compare and confirm the original and candidate occupy the compare slots.
- Re-run feature analysis for one asset and confirm the panel refreshes.
- Open Similarity Ready, High Loop Quality, Start Silence, End Silence, High Peak, High RMS, Feature Missing, and Needs Reanalysis smart folders.
- Confirm loop boundary similarity and loop reasons appear in the inspector when feature data exists.
- Confirm waveform previews show silence overlays, a peak marker, and an RMS bar when waveform analysis exists.
- Confirm similarity results never auto-create tags, collections, ratings, or sidecar files.

## Phase 6 Release Stability

- Open Settings > Library and confirm **Open Log Folder** opens the local log folder.
- Run diagnostics and confirm the log path is visible.
- Click **Show Recent Logs** after running diagnostics and confirm recent log lines appear without blocking the UI.
- Trigger a safe renderer fallback during development or test build and confirm the error boundary shows retry and log-folder actions instead of a raw stack trace.
- Confirm main-process uncaught errors, unhandled rejections, renderer process exits, diagnostics, import warnings, and renderer fallback reports are written to the local log.
- Import corrupted WAV, empty file, unsupported file, duplicate file, missing link-mode file, and missing copy-mode file cases and confirm the app remains usable.
- Confirm analysis/feature/similarity failures do not remove assets.
- Confirm export write failures report summary warnings/errors and do not modify original audio.
- Confirm backup failure or target collision leaves the source library usable.
- Confirm permanent delete still deletes only safe copy-mode files and never deletes link-mode originals.
- Browse at least 1,000 generated fixture files and check paging, Load More, search/filter, smart folders, quick preview, similarity panel, export preview, and backup remain responsive.
- Confirm no AI, cloud, ffmpeg, or GPL runtime dependency was added.
- If `electron-builder` prints `duplicate dependency references`, record it as informational when pack/dist/smoke still pass.

## Packaged App Smoke

- Launch `release\win-unpacked\Suwol Audio Reference.exe`.
- Launch the same executable a second time and confirm the existing window is focused or restored instead of leaving two main windows open.
- Confirm the app icon and window title are correct.
- Open Settings > About and confirm version `0.1.1`, license `Apache-2.0`, release notes path, known issues path, and Windows distribution guide path.
- Create or open a library.
- Import the fixture set.
- Play one imported audio file.
- Switch ko/en and restart to confirm locale persistence.
- Confirm waveform, analysis, feature vector, similar sounds, quick preview, and A/B compare work in the packaged build.
- Run Export Center for Codex instruction, generic manifest, and sound pack metadata/folder outputs.
- Run backup and diagnostics.
- Open settings and run diagnostics.
- Close and reopen the packaged app.
- Confirm the same library can be reopened and browsed.
- Extract `release\Suwol Audio Reference 0.1.1 Windows x64.zip` to a writable folder and run the executable from the extracted `win-unpacked` folder.
- Download the GitHub Actions Linux artifact or GitHub Release Linux zip, extract it on Linux, set executable permission if needed, and run the packaged executable.
