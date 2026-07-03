# Suwol Audio Reference

Suwol Audio Reference is a local-first Electron + React + TypeScript MVP for collecting, searching, tagging, and reviewing audio reference files. It stores library metadata in SQLite and connects the existing local audio analysis feature slice to the real import and inspector flow.

The app does not use LLMs, Whisper, cloud AI APIs, or external audio analysis services. The MVP also does not add an app-managed ffmpeg executable or GPL-family runtime package. Analysis results are presented as suggestions only; tags are written to the library only when the user applies them.

## Status

This repository is preparing a Windows MVP release. The current build includes:

- Electron main/preload/renderer app structure.
- Korean and English localization with persisted language settings.
- Library creation/opening and recent library tracking.
- SQLite schema migrations under `.suwol-audio/library.sqlite`.
- Copy-mode import into `.suwol-audio/assets/`.
- Link-mode support for references that should not be copied into the library.
- Asset, tag, collection, trash, restore, and permanent delete services.
- Local audio analysis queue stored in `asset_audio_analysis`.
- Local audio feature vectors stored in `asset_audio_features` for similarity search.
- Asset browser with search, filters, selection, and batch actions.
- Audio player bar with A/B repeat basics.
- Inspector for memo, rating, favorite, tags, collections, and analysis suggestions.
- Import summaries for duplicates, unsupported files, copy failures, and analysis failures.
- Library diagnostics from the settings dialog.
- Quick Preview settings for short UI/SFX sounds.
- Keyboard navigation and quick rating/favorite shortcuts.
- A/B comparison for selected assets with optional RMS/peak-based playback gain matching.
- Smart folders for recent playback, short sounds, BGM/ambience, loop candidates, retro candidates, analysis missing, and unplayable assets.
- Smart folders for similarity-ready assets, high loop quality, silence at boundaries, high peak/RMS, missing features, and outdated feature analysis.
- Recent playback tracking with `last_played_at` and `play_count`.
- Playback unsupported state tracking for browser/codec failures.
- Advanced library diagnostics for missing files, orphan relations, duplicate groups, missing waveforms, and migration version.
- Missing file detection with single-asset relink and bulk relink preview/apply.
- Duplicate group manager with metadata merge, trash duplicates, and ignored groups.
- Library backup with `backup-manifest.json`.
- Metadata export to JSON or CSV without copying source audio files.
- Tag and collection management with usage counts, rename, merge/delete, and unused cleanup.
- Manual folder rescan for new import candidates.
- Sidecar metadata export next to selected asset files.
- Export Center for selected assets, current filters, collections, tags, smart folders, and whole-library sources.
- Codex instruction export to Markdown or JSON context files without calling Codex, OpenAI, or cloud APIs.
- Game-audio manifest export for generic JSON, Unity JSON, Unreal JSON/CSV, and MonoGame JSON/content-list workflows.
- Sound pack metadata and folder export with copy-only audio handling.
- User-entered source, license, credit, and rights metadata on each asset.
- Export presets, preview validation, warning acknowledgement, and export summaries.
- Polished main workflow with paged asset loading, clearer selection/playback states, toast feedback, modal confirms, progress overlays, and shortcut help.
- Collapsible inspector sections for file info, memo/rating, audio details, tags/collections, analysis, rights, and export shortcuts.
- Similar Sounds panel in the inspector with local DSP candidate scores, reason chips, duplicate markers, play, and A/B compare actions.
- WAV PCM analysis uses a local parser for supported PCM/float WAV files; unsupported codecs keep the existing metadata-only fallback.
- Settings tabs for general, playback, library management, shortcuts, and about.
- Windows packaging metadata and generated application icons.
- GitHub Actions workflow for Windows/Linux zip artifacts and tag-based GitHub Releases.

## Supported Platform

- Primary target: Windows 10/11 x64.
- Secondary CI package target: Linux x64 zip.
- Development target: Node.js 24+ and npm 10+ on Windows PowerShell.
- macOS builds are not release targets for this MVP.

## Supported Audio Inputs

The MVP accepts common local audio file extensions handled by the current import allowlist:

- `.wav`
- `.mp3`
- `.flac`
- `.ogg`
- `.m4a`
- `.aac`

Unsupported file types are skipped and reported in the import summary.

## Library Layout

Each library has a hidden app folder:

```text
<library root>/
  .suwol-audio/
    library.sqlite
    assets/
```

Copy-mode imports are stored below `.suwol-audio/assets/`. Link-mode references keep the original file path and never delete the source file during permanent delete. For backup, copy the entire library root, including `.suwol-audio`.

## Localization

- Default language: Korean (`ko`).
- Additional supported language: English (`en`).
- The app reads the saved language first, then checks the OS locale, then falls back to Korean.
- User-created tag names, collection names, memos, and filenames are not automatically translated.
- Every new UI, main-process dialog/menu label, and error-code message must include both Korean and English strings.

### Adding A New Language

1. Add renderer messages at `src/renderer/i18n/locales/<locale>.json`.
2. Add Electron menu/dialog messages at `src/main/i18n/locales/<locale>.json`.
3. Register the locale in `src/shared/i18n/locales.ts`.
4. Keep all keys aligned with Korean and English, then run `npm.cmd run check:i18n`.
5. Do not translate user-authored data such as filenames, paths, tags, collections, memos, asset titles, rights fields, export preset names, or manually entered Codex/export goals.

## Development

Install dependencies:

```bash
npm.cmd install
```

Node 24+ is required because the local SQLite layer uses `node:sqlite`.

Run the app in development:

```bash
npm.cmd run dev
```

Core verification:

```bash
npm.cmd run typecheck
npm.cmd run check:i18n
npm.cmd test
npm.cmd audit
npm.cmd run build
npm.cmd run smoke:production-entry
```

Generate icons:

```bash
npm.cmd run icons:generate
```

Generate local QA audio fixtures:

```bash
npm.cmd run fixtures:audio
```

Generate larger local QA fixture sets without storing binaries in the repo:

```bash
npm.cmd run fixtures:large -- C:\Temp\suwol-audio-large-fixtures
npm.cmd run fixtures:large -- C:\Temp\suwol-audio-1000 --sfx 350 --ui 350 --loops 150 --ambience 150
```

Check localization key parity:

```bash
npm.cmd run check:i18n
```

Run production entry smoke checks after `build`:

```bash
npm.cmd run smoke:production-entry
```

Phase 2 UX highlights:

- Arrow keys move the asset selection.
- `Enter` plays the selected asset.
- `Space` toggles playback.
- `Esc` stops playback and clears selection.
- `F` toggles favorite.
- `1`-`5` set rating, and `0` clears rating.
- `L`, `A`, and `B` control loop and A/B points.
- `Ctrl+F` focuses search.
- `Ctrl+A` selects all visible assets.
- `Delete` moves selected assets to trash after confirmation.

Phase 3 library management highlights:

- Diagnostics scans database integrity, missing files, orphan rows, duplicate groups, waveform gaps, and playback state.
- Backup preserves the local library folder and writes `backup-manifest.json`.
- Metadata export is for reporting/migration and does not include audio binaries.
- Backup and metadata export are intentionally separate workflows.
- Relink updates DB paths only; it does not move or delete original linked files.
- Duplicate cleanup never auto-deletes files. Duplicate assets are moved to trash first.
- Permanent delete still deletes only safe copy-mode files under `.suwol-audio/assets/`.

Phase 4 export workflow highlights:

- Export Center lives in the main browser flow and can export selected assets, the current filter result, a collection, a tag, a smart folder, or the whole library.
- Codex export writes local `.md` or `.json` instruction/context files only. It does not call Codex, OpenAI, LLMs, or any cloud API.
- Game manifest export creates files that Unity, Unreal, MonoGame, or custom tools can read. It does not modify engine projects or generate plugins.
- Sound pack folder export copies source audio into a new export folder when requested. It never moves, deletes, edits, transcodes, or renames original audio files.
- Rights/license fields are user-authored metadata. The app does not infer licenses or provide legal judgments.
- Preview validation reports missing files, unsupported playback, duplicate engine keys/output names, unknown license metadata, missing attribution, loop warnings, absolute path inclusion, and target collisions.
- Backup, metadata export, and sound pack export are separate workflows: backup preserves the library, metadata export writes reports, and sound pack export packages a game-audio handoff.

Phase 5A usability notes:

- The asset browser requests assets in pages instead of loading the entire filtered result into the renderer at once.
- Use **Load More** to continue through large libraries.
- Selected assets and the currently playing asset have separate visual states.
- The `?` key opens the shortcut help overlay when focus is not inside an input, textarea, select, or editable field.
- Settings and inspector details are grouped into smaller sections so library management and export workflows are easier to find.
- Toasts, confirmation dialogs, and progress overlays are shared UI components for long-running or risky actions.

Phase 5B analysis and similarity notes:

- Similarity search is local DSP only. It does not call LLMs, Whisper, OpenAI, cloud APIs, ffmpeg, or external analysis services.
- Similar Sounds are candidates only. The app never auto-applies tags, collections, ratings, or file changes from similarity results.
- Duplicate files are still identified by `content_hash` and shown as duplicate, distinct from merely similar sounds.
- Feature analysis records analyzer versions so missing or outdated features can be re-run for selected assets or batches.
- Loop quality now includes boundary similarity, click risk, fade-out risk, and localized reasons in the inspector.
- Waveform previews show silence-at-start/end overlays, a peak marker, and an RMS level bar when analysis data exists.

Phase 6 release-stability notes:

- Renderer crashes are caught by a localized error boundary with retry and log-folder actions.
- Main-process uncaught exceptions, unhandled rejections, renderer process exits, diagnostics, import warnings, and renderer error-boundary reports are written to the local app log.
- The Settings Library/About tabs expose the local log folder. Logs stay local and are not uploaded.
- `check:i18n` verifies renderer and main-process ko/en locale parity.
- Large QA fixture generation is local-only and creates temporary WAV/edge-case files outside the repository.

Phase 7 release-readiness notes:

- The app requests a single-instance lock. A second launch should focus or restore the existing window instead of keeping a duplicate main window open.
- Manual QA is documented in `docs/manual-qa.md`.
- Windows unsigned distribution guidance is documented in `docs/windows-distribution.md`.
- Linux zip distribution guidance is documented in `docs/linux-distribution.md`.
- Release notes and known issues are documented in `docs/release-notes-0.1.0.md` and `docs/known-issues.md`.
- `check:release` validates the expected zip artifact, unpacked executable, release docs, notices, icons, and package metadata.

GitHub release workflow notes:

- Main branch pushes and pull requests build Windows and Linux zip artifacts.
- `v*` tag pushes create a GitHub Release and upload the Windows/Linux zip artifacts.
- The automated release workflow uploads zip files only. It does not publish installers, AppImage, deb, rpm, or signed packages.
- No GitHub secrets, OpenAI/Codex/API keys, code-signing certificates, or cloud service credentials are required.

## Logs And Troubleshooting

- Logs are stored under the app user-data folder, in `logs/app.log`.
- In the app, open **Settings > Library > Open Log Folder** or **Settings > About > Open Log Folder**.
- UI errors show localized messages instead of raw stack traces. The detailed stack is written to the local log file.
- Import, analysis, playback, export, backup, relink, and diagnostics failures should be reported with an error code or a batch warning and should not delete or modify original source audio.

## Large Library Tips

- Use copy mode when you want the library to preserve audio inside `.suwol-audio/assets/`.
- Use link mode when files should stay in their original folders. Link-mode originals are never deleted by permanent delete.
- For 1,000+ assets, rely on browser paging and **Load More** instead of selecting the whole library at once.
- Run diagnostics after large imports to check missing files, analysis gaps, duplicate groups, feature status, and log path.
- Similarity search uses stored local feature vectors and bounded prefiltering; re-run feature analysis for missing or outdated feature rows.

## Known Build Notes

- `electron-builder` may print an informational `duplicate dependency references` line for transitive package metadata. The release gate is whether `pack`, `dist`, and `smoke:packaged-paths` pass.
- The app does not add an app-managed ffmpeg executable and does not add GPL-family runtime dependencies. Electron may include Chromium media codec components as part of its runtime.
- Packaged smoke checks verify production entries, resources, bundled i18n markers, the unpacked executable, app bundle, and zip artifacts.

## Packaging

Create an unpacked Windows build:

```bash
npm.cmd run dist:win:dir
npm.cmd run smoke:packaged-paths
```

Create a Windows zip:

```bash
npm.cmd run zip:win
npm.cmd run check:release -- --platform win
```

Create a Linux zip in GitHub Actions or on Linux:

```bash
npm run dist:linux:dir
npm run zip:linux
npm run check:release -- --platform linux
```

Validate current-platform release outputs:

```bash
npm.cmd run check:release -- --platform win
```

Release outputs are written to `release/`, which is intentionally ignored by git.

## GitHub Releases

The public release path is GitHub Releases on `suwol-suite/SuwolAudioReference`.

Main branch pushes and pull requests create downloadable workflow artifacts. A version tag creates a GitHub Release and uploads the Windows/Linux zip files:

```bash
git tag v0.1.0
git push origin v0.1.0
```

For the next release, update `package.json` version, add a matching `docs/release-notes-x.y.z.md`, verify the release checks, then tag as `vX.Y.Z`.

Windows users:

1. Download `Suwol Audio Reference 0.1.0 Windows x64.zip`.
2. Extract it to a writable folder.
3. Run `Suwol Audio Reference.exe` from the extracted `win-unpacked` folder.

Linux users:

1. Download `Suwol Audio Reference 0.1.0 Linux x64.zip`.
2. Extract it to a writable folder.
3. If needed, set executable permission:

```bash
chmod +x "suwol-audio-reference"
./suwol-audio-reference
```

The exact Linux executable name is verified by the release artifact checker and may follow electron-builder naming.

## Windows Distribution Notes

- Windows zip artifact: `release\Suwol Audio Reference 0.1.0 Windows x64.zip`.
- Unpacked executable: `release\win-unpacked\Suwol Audio Reference.exe`.
- The current MVP is unsigned. Windows SmartScreen or browser download checks may warn that the publisher is unknown.
- Do not ask testers to ignore security warnings blindly. Publish release notes, hashes, license, third-party notices, and the artifact source so testers can verify what they run.
- See [Windows distribution guide](./docs/windows-distribution.md) for the full unsigned-build guidance.

## Release Documents

- [Manual QA guide](./docs/manual-qa.md)
- [QA checklist](./docs/qa-checklist.md)
- [Release checklist](./docs/release-checklist.md)
- [Release notes 0.1.0](./docs/release-notes-0.1.0.md)
- [Known issues](./docs/known-issues.md)
- [Windows distribution guide](./docs/windows-distribution.md)
- [Linux distribution guide](./docs/linux-distribution.md)
- [Third-party notices](./THIRD_PARTY_NOTICES.md)

## License

Suwol Audio Reference is licensed under Apache-2.0. See [LICENSE](./LICENSE).
