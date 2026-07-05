# Suwol Audio Reference Manual QA Guide

Use this guide for a human smoke pass before publishing a Windows 0.1.1 build. The goal is to confirm that a real user can install, open, import, listen, organize, export, and recover from common errors without the app modifying original audio files.

Record the tester name, Windows version, package type, tested artifact path, date, fixture folder, and final pass/fail result in the release notes.

## QA Run Record

Fill this in before publishing a 0.1.1 build:

- Tester:
- Date:
- Windows version:
- Artifact type: unpacked / extracted Windows zip / Linux zip
- Artifact path:
- Fixture folder:
- Commit:
- Result: pass / fail / blocked
- Notes:

## Before You Start

- Close any running Suwol Audio Reference windows before launching a packaged build.
- Prefer `release\win-unpacked\Suwol Audio Reference.exe` for the full Windows manual pass.
- Extract `release\Suwol Audio Reference 0.1.1 Windows x64.zip` to a normal writable folder before running the executable from the extracted `win-unpacked` folder.
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
5. Confirm version `0.1.1`, license `Apache-2.0`, release notes path, known issues path, and Windows distribution guide path are visible.
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
11. Select a game project as the source.
12. Preview Project Sound Pack, Project Manifest, Project Missing Report, and Project Codex Instruction.
13. Confirm Export History shows successful and failed runs and that deleting a history row does not delete exported files.

## H2. Sound Usage Board

1. Open the Sound Usage Board from the main toolbar.
2. Create a game project and set the engine type.
3. Confirm the dashboard counts and risk filter buttons respond to the current board state.
4. Click required, no-candidate, selected, approved, and risk dashboard cards and confirm the active filter label and clear-filter action behave correctly.
5. Confirm no usage template is applied automatically.
6. Apply one built-in template explicitly and confirm the create/update/skip preview appears before rows are created.
7. Save the project as a custom template, rename it, apply it to another project, and delete it.
8. Use Bulk Add to paste usage rows, including blank lines, comments, an unknown category, an unknown priority, and a loop marker. Inspect the preview metrics, then confirm creation.
9. Add a manual usage key such as `ui.click`.
10. Edit category, status, priority, required, loop required, variants allowed, target duration, target loudness note, description, and notes.
11. Confirm unsaved changes are indicated before saving.
12. Use quick status actions to mark reviewing, approved, deferred, and rejected.
13. Add the currently selected browser asset as a candidate.
14. Search for another asset and add it as a candidate.
15. From the Asset Inspector, confirm linked usage items appear, use Open Board, and add the current asset to a usage item.
16. Mark one candidate selected and confirm the usage row updates.
17. Approve the selected candidate and confirm rejected or unselected candidates are not treated as final.
18. With variants disabled, select another candidate and confirm only one candidate remains selected.
19. Enable variants and confirm multiple selected candidates are allowed.
20. Reject a candidate and confirm it is not selected. Restore it before selecting it again.
21. Confirm candidate rows show rank, fit score/reasons, duration, classification, rating/favorite, loop score, RMS/peak, rights risk, selected, approved, rejected, missing-file, and playback-support states.
22. Confirm play, A/B compare, and Set Selected controls are disabled for missing or unplayable files.
23. Confirm an asset already linked as a candidate is shown as already linked instead of being added twice.
24. Run board validation and confirm missing required sounds, selected file risks, license warnings, loop mismatch, playback support, and engine key readiness are shown when applicable.
25. Apply or copy a suggested key only through the explicit action.
26. Filter by required, critical, loop required, recently updated, priority, and required-first sort.
27. Run candidate suggestions from the usage item and from an existing candidate. Confirm they do not auto-select, tag, rate, copy, or alter assets.
28. Send two candidates to A/B compare and confirm the existing compare panel shows them.
29. Use the project export shortcut and confirm Export Center opens prefilled.
30. Use the current-filter shortcut and confirm only filtered usage items are included in Export Center preview.
31. Preview missing report and confirm required missing usage keys appear.
32. Export generic, Unity, Unreal CSV, MonoGame, Codex instruction, sound pack plan, and missing report outputs through Export Center.
33. Confirm export preview includes board summary, validation summary, missing/risk counts, item count, selected assets, candidates, error/warning counts, planned files, and the non-destructive safety note.
34. Confirm export execution is blocked while validation errors remain.
35. Confirm exported project files include `usageKey` mappings.
36. Confirm Unity, Unreal, MonoGame, and other engine project folders are not modified directly.

## H2A. Sound Workflow Productivity

1. Open the Sound Usage Board and confirm the Sound Work TODO board appears under the dashboard.
2. Confirm Missing, Need Candidates, Reviewing, Selected, Approved, Deferred, and Risk queues update as usage items and candidates change.
3. Type an assignee and due label into a usage item workflow section, then filter the TODO board by those values.
4. Change status and priority from a TODO card and confirm the selected usage detail reflects the same values.
5. Enter work note, review note, and decision note, save, close the board, reopen it, and confirm the text persists.
6. Select or approve a candidate without review/decision notes and confirm validation reports the expected warnings.
7. Add candidate pros, cons, review note, decision reason, fit rating, loudness fit, loop fit, and mood fit. Confirm this does not auto-select or auto-approve the candidate.
8. Save a Project Sound Style Guide. Switch between Korean and English UI and confirm the user-entered guide text is unchanged.
9. Confirm a new project checklist is empty until Add built-ins is clicked.
10. Add built-in checklist rows, check one row, edit its note, add a custom row, and delete a row.
11. Preview Sound Request Markdown, CSV, and JSON in Export Center and confirm absolute file paths are excluded by default.
12. Export Project Style Guide Markdown and Project Checklist Markdown.
13. Preview Project Sound Pack and Project Codex Instruction with style/checklist/work/review/decision include options toggled on and off.

## H3. Project Sound Pack Export Center Flow

1. In Sound Usage Board, create or reuse a test project and open Project Sound Pack through Export Center.
2. Create at least five usage items: three approved selected items, one required missing item, and one selected item with unknown license metadata.
3. Select candidates for the approved items and approve them explicitly.
4. Leave one selected candidate unapproved and confirm it appears as a warning in sound pack preview.
5. Preview Project Sound Pack in Export Center with the default approved-only options.
6. Confirm files-to-copy, approved-selected count, unknown-license count, warning count, output folder, and output tree preview look correct.
7. Switch filename policy to usage-key filename and confirm the rename plan uses safe usage-key names.
8. Switch engine profile to Unity, Unreal, and MonoGame and confirm the planned folder roots change inside the export folder only.
9. Acknowledge warnings, export the sound pack, and open the output folder.
10. Confirm `manifest.json`, engine-specific manifest/list files, `README.md`, `credits.md`, `missing-sounds.md`, `validation-report.md`, and metadata CSV files exist.
11. Confirm Unreal CSV contains `UsageKey` and MonoGame content list contains `# Usage:` comments.
12. Confirm original source audio files are still present and unchanged.
13. Move or delete one selected source file outside the app, preview again, and confirm export is blocked by a missing-file error.

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

## K. Release Sign-Off

1. Confirm `docs/release-notes-0.1.1.md` matches the tested artifact.
2. Confirm `docs/known-issues.md` covers unsigned Windows warnings, zip-first distribution, Linux playback differences, copy-only Project Sound Pack export, and no direct engine project mutation.
3. Confirm `docs/release-checklist.md` automated gates are complete.
4. Confirm no stage, commit, push, tag, or GitHub Release action was performed during the QA documentation pass.
5. Record any manual QA gaps that still need a human tester before publishing.

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
