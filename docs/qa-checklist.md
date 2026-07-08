# Suwol Audio Reference QA Checklist

Use this checklist before an MVP release candidate is accepted. Record the tested commit, Windows version, package type, and tester name in the release notes.

## Automated Gates

- `npm.cmd run typecheck` passes.
- `npm.cmd test` passes.
- `npm.cmd audit` passes or every finding has a documented release decision.
- `npm.cmd run check:i18n` passes.
- `npm.cmd run check:release-tag -- --tag=v0.1.4` passes before any tag is created.
- `npm.cmd run build` passes.
- `npm.cmd run smoke:production-entry` passes after build.
- `npm.cmd run pack` passes.
- `npm.cmd run smoke:packaged-paths` passes after pack.
- `npm.cmd run dist:win:dir` passes when publishing a Windows zip.
- `npm.cmd run zip:win` passes after the Windows unpacked build is created.
- `npm.cmd run check:release -- --platform win` passes after the Windows zip is created.
- `npm.cmd run checksums` and `npm.cmd run check:release -- --platform win --require-checksums` pass when publishing checksum files.
- The GitHub Actions Linux job passes `npm run dist:linux:dir`, `npm run zip:linux`, `npm run check:release -- --platform linux`, and tag/manual Linux AppImage packaging.
- The GitHub Actions Linux tag/manual job passes `npm run check:linux-updater` and uploads the AppImage, `latest-linux.yml`, `checksums.txt`, and `checksums.txt.asc`. Sidecar blockmap upload is optional when electron-builder generates one.
- The GitHub Actions macOS tag/manual job signs, notarizes, and uploads the arm64 DMG/zip assets when Apple secrets are configured.
- `package.json` version is `0.1.4`, `engines.node` is Node 24+, license is `Apache-2.0`, Windows packaging remains zip-first, Linux release packaging includes zip/AppImage, and macOS release packaging includes arm64 DMG/zip.
- Update settings default to `checkOnStartup=false`, `autoDownload=false`, and Linux AppImage-only policy.
- Settings Updates shows the Release Status dashboard, current version, distribution type, expected release assets, checksum commands, and GitHub Releases actions.

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
- Select a game project as the Export Center source.
- Preview and export Project Sound Pack from Export Center.
- Preview and export Project Manifest from Export Center for Generic, Unity, Unreal, and MonoGame profiles.
- Preview and export Project Missing Report and Project Codex Instruction from Export Center.
- Preview and export Sound Pack Snapshot JSON from a game project source.
- Preview and export Sound Pack Changelog Markdown, JSON, and CSV from a baseline snapshot to the current board.
- Confirm project export presets can be saved, applied, and deleted while built-in project presets are not written to the preset table.
- Confirm successful and failed Export Center runs appear in export history and can be deleted without deleting output files.
- Export files with Korean filenames.
- Export files with spaces and special characters in filenames.
- Confirm original source audio files are not renamed, moved, edited, transcoded, or deleted.
- Confirm Unity/Unreal/MonoGame exports do not modify engine project folders directly.

## Sound Usage Board

- Open Sound Usage Board from the main toolbar.
- Create a game project and confirm it is scoped to the active library.
- Update engine type, namespace, and default project export format.
- Confirm the dashboard counts total, missing, review, selected, approved, and risk states.
- Click dashboard and risk-strip filters, including required, no-candidate, selected, approved, and risk cards, and confirm the usage list updates without changing data.
- Confirm the active filter label and clear-filter action reflect the current dashboard or risk selection.
- Confirm templates are not applied automatically to a new project.
- Apply Basic Mobile Game UI, Basic RPG, Basic Action Game, or Basic Casual Game only by explicit user action.
- Confirm template apply preview shows create/update/skip counts before rows are written.
- Save the current project as a custom template, apply it to another project, rename it, and delete it.
- Paste several usage rows into Bulk Add and confirm preview counts for valid, create, update, skip, duplicate, existing, invalid, unknown category, unknown priority, loop-detected, comment, and blank rows before creating.
- Confirm duplicate usage keys are skipped or rejected without corrupting existing rows.
- Add a manual usage key and edit display name, category, status, priority, required, loop required, variants allowed, target duration, and notes.
- Edit target loudness note and description, then confirm unsaved-change state appears before saving.
- Use quick review actions to mark usage items reviewing, approved, deferred, and rejected.
- Add selected browser assets as candidates for a usage item.
- From the Asset Inspector, confirm linked usage items appear for assets already used as candidates or selected assets.
- From the Asset Inspector, use Open Board and confirm it returns to the board workflow.
- From the Asset Inspector, add the current asset to a usage item and confirm it appears in the board candidate list.
- Search assets inside the board and add a candidate manually.
- Mark a candidate selected and confirm the board status updates.
- Approve a selected candidate and confirm an unselected candidate cannot be approved as final.
- With variants disabled, confirm selecting a second candidate clears the first selection.
- With variants enabled, confirm multiple selected candidates are allowed.
- Reject a candidate and confirm it is not selected. Confirm the rejected candidate must be restored before it can be selected again.
- Confirm candidate rows show rank, fit score/reasons, duration, classification, rating/favorite, loop score, RMS/peak, rights risk, selected, approved, and rejected states.
- Confirm candidate play, A/B compare, and Set Selected controls are disabled for missing or unplayable files.
- Confirm searching or suggesting an asset that is already linked shows an already-candidate state instead of creating a duplicate link.
- Use board validation and confirm missing required sounds, selected missing files, unsupported playback, unknown license, loop mismatch, credit warnings, and engine key warnings are shown when applicable.
- Apply or copy a suggested engine/usage key only by clicking the explicit action.
- Filter and sort usage rows by missing, risk, review state, candidate count, key, status, category, and priority.
- Filter by required, critical, loop required, recently updated, and priority. Sort by required-first and confirm required rows stay above optional rows.
- Run candidate suggestions and confirm they do not auto-select, tag, rate, copy, or mutate assets.
- Run candidate suggestions from an existing candidate and confirm the seed changes suggestions without mutating the board.
- Send two candidates to A/B compare and confirm the existing compare panel receives both assets.
- Generate a missing sound report and confirm required missing items, candidate gaps, loop warnings, and unknown selected licenses are represented.
- Use the Sound Board project export shortcuts and confirm they open Export Center prefilled instead of writing files directly.
- Use the current-filter shortcut and confirm only the filtered usage items are exported.
- Preview and export generic, Unity, Unreal CSV, MonoGame, Codex instruction, sound pack plan, and missing report outputs through Export Center.
- Confirm export preview includes board summary, validation summary, missing/risk counts, item count, selected asset count, candidate count, copy estimate, skip estimate, planned files, and the non-destructive safety note before export.
- Confirm export execution is blocked while validation errors remain.
- Confirm `usageKey` appears in project manifests and Unreal CSV.
- Confirm MonoGame export includes usage-key comments.
- Confirm Codex instruction export includes the sound usage board.
- Confirm Sound Work TODO queues show Missing, Need Candidates, Reviewing, Selected, Approved, Deferred, and Risk counts.
- Filter the TODO queue by assignee and due label, then confirm selecting a task opens the matching usage item.
- Change usage status and priority from a TODO card and confirm the board summary and validation refresh.
- Edit workflow assignee, due label, work note, review note, and decision note, then confirm they persist after closing and reopening the board.
- Add candidate pros, cons, review note, decision reason, usage fit rating, loudness fit, loop fit, and mood fit, then confirm they persist without auto-selecting or auto-approving the candidate.
- Save a Project Sound Style Guide and confirm user-entered text is not translated when switching locales.
- Confirm a new project starts with no checklist rows, then explicitly add built-in checklist items.
- Check and uncheck checklist items, edit notes, add a custom checklist item, and delete a checklist item.
- Confirm validation warns for approved items without decision notes, selected items without review notes, open TODO work notes, empty style guide, incomplete checklist, and selected candidates without review/rating.
- Preview Sound Request Markdown, CSV, and JSON from Export Center and confirm absolute paths are excluded by default.
- Export Project Style Guide Markdown and Project Checklist Markdown from Export Center.
- Confirm Project Sound Pack and Project Codex Instruction include style/checklist/work/review/decision notes only when the related include options are enabled.
- Confirm project exports do not modify Unity, Unreal, MonoGame, or other game project files.
- Create a Sound Pack Snapshot, freeze it, set it as baseline, compare it against current, and confirm the diff shows selection/approval changes.
- Run rollback preview before applying and confirm rollback only restores existing candidate selected/approved flags.
- Create or import hundreds of usage rows and confirm search, filters, sort changes, item selection, detail editing, and candidate list rendering remain responsive.

## Project Sound Pack Export Center Flow

- From Sound Usage Board, open Project Sound Pack in Export Center and preview before export.
- Confirm the default export includes approved selected assets only.
- Confirm selected but not approved assets appear as warnings and are skipped by default.
- Confirm the warning acknowledgement is required before exporting with warnings.
- Confirm a missing selected source file blocks export.
- Confirm unknown license metadata appears as a review warning.
- Confirm credit-required assets without attribution appear in the credits/validation reports.
- Confirm usage-key filename policy creates names such as `ui_button_click.wav`.
- Confirm variants use numbered suffixes such as `combat_hit_light_01.wav`.
- Confirm original filename policy keeps original names and resolves collisions with suffixes.
- Confirm Generic profile writes `audio/<category>/...` and `manifest.json`.
- Confirm Unity profile writes `Assets/Audio/...` and `UnityAudioManifest.json` inside the export folder only.
- Confirm Unreal profile writes `ContentImport/Audio/...`, `UnrealAudioManifest.json`, and `UnrealAudioManifest.csv`.
- Confirm MonoGame profile writes `Content/Audio/...`, `MonoGameAudioManifest.json`, and `MonoGameContentList.txt`.
- Confirm `README.md`, `credits.md`, `missing-sounds.md`, `validation-report.md`, and metadata CSV files are created.
- Confirm output folder open action opens the generated sound pack folder.
- Confirm original source audio files are unchanged after export.

## Sound Pack Snapshot / Diff / Rollback

- Create a Sound Pack Snapshot from Sound Usage Board and confirm it appears in the snapshot list.
- Freeze the snapshot and confirm it cannot be deleted from the normal snapshot action.
- Set the frozen snapshot as the project baseline and confirm the baseline label persists after closing/reopening the board.
- Change selected/approved candidates on the current board, then compare the baseline snapshot against current and confirm selection/approval changes are shown.
- Open Sound Pack Changelog from the snapshot panel and confirm Export Center is prefilled with the game project source and snapshot target.
- Export snapshot JSON and changelog Markdown/JSON/CSV, then confirm absolute local source paths are not included by default.
- Run rollback preview and confirm it lists changes and skipped missing candidates before any DB state changes.
- Apply rollback only after confirmation and confirm existing candidate selected/approved flags return to the snapshot state.
- Confirm rollback does not create/delete usage rows, create/delete assets, move source audio, or modify engine project files.

## Sound Change Review

- Create a baseline snapshot, change the selected/approved asset on the current board, then create a Change Review from baseline.
- Confirm pending review items show change type, severity, before/after values, usage key, reviewer note, and decision reason fields.
- Approve one change, reject one change, and defer one change. Confirm summary counts and filters update.
- Save a reviewer note and decision reason, close/reopen the board, and confirm they persist.
- Export a Change Review Markdown/JSON/CSV report from Export Center and confirm absolute source paths are excluded by default.
- Export a Sound Pack Changelog with review decisions enabled and confirm approved/rejected/deferred decisions are reflected only when the option is enabled.
- Confirm rejected change still present and pending breaking/selection/rights review warnings appear as warnings, not automatic mapping changes.
- Preview Project Sound Pack with latest review summary and optional review report, then confirm original source audio and game project files are unchanged.
- Switch ko/en and confirm Change Review labels, statuses, severities, and Export Center options are localized.

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
- Open Settings > About and confirm version `0.1.4`, license `Apache-2.0`, release notes path, known issues path, and Windows distribution guide path.
- Create or open a library.
- Import the fixture set.
- Play one imported audio file.
- Switch ko/en and restart to confirm locale persistence.
- Confirm waveform, analysis, feature vector, similar sounds, quick preview, and A/B compare work in the packaged build.
- Create a Sound Usage Board project, add candidates, preview missing report, and export one project manifest.
- Run Export Center for Codex instruction, generic manifest, and sound pack metadata/folder outputs.
- Run backup and diagnostics.
- Open settings and run diagnostics.
- Close and reopen the packaged app.
- Confirm the same library can be reopened and browsed.
- Extract `release\SuwolAudioReference-0.1.4-win-x64.zip` to a writable folder and run the executable from the extracted `win-unpacked` folder.
- Download the GitHub Actions Linux artifact or GitHub Release Linux AppImage/zip, verify signed checksums when available, set executable permission if needed, and run the packaged executable.
- On Linux AppImage, confirm Settings Updates shows automatic update support and manual check/download/install controls.
- On a 0.1.3 Linux AppImage, confirm the 0.1.4 GitHub Release can be detected as an available update when the release assets are present.
- On Windows zip, Linux zip, and macOS assets, confirm Settings Updates shows manual GitHub Releases guidance and does not start an updater check.
- Confirm Settings Updates shows Windows zip, Linux zip, Linux AppImage, macOS DMG/zip, `latest-linux.yml`, `latest-mac.yml`, `checksums.txt`, `checksums.txt.asc`, versioned checksum copies, and `suwol-release-public-key.asc` as expected release assets for the current version.
- Confirm the checksum help shows `gpg --import suwol-release-public-key.asc`, `gpg --verify checksums.txt.asc checksums.txt`, and `shasum -a 256 -c checksums.txt`.
