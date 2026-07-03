# Suwol Audio Reference 0.1.0

## Summary

Suwol Audio Reference 0.1.0 is the first Windows MVP for managing a local audio reference library. It focuses on importing, listening, organizing, analyzing, comparing, diagnosing, backing up, and exporting local audio asset metadata without cloud services or AI APIs.

## Highlights

- Library create/open with recent library tracking.
- Copy-mode and link-mode audio import.
- SQLite metadata storage under `.suwol-audio/library.sqlite`.
- Waveform preview and local DSP analysis.
- Suggested tags that are applied only by user action.
- Quick Preview for short UI/SFX candidates.
- A/B compare with optional RMS/peak-based loudness matching.
- Similar Sounds candidate search using local feature vectors.
- Smart folders for recent playback, loop candidates, unplayable assets, similarity readiness, high RMS/peak, silence boundaries, and missing/outdated features.
- Library diagnostics, missing-file relink, duplicate manager, backup, metadata export, and sidecar export.
- Export Center for Codex instruction Markdown/JSON, generic manifests, Unity, Unreal, MonoGame, and sound pack exports.
- User-entered source, license, credit, and rights metadata.
- Korean and English localization.
- Local logging, recent log display, and renderer ErrorBoundary fallback.
- Windows and Linux zip artifact support through GitHub Actions.

## Supported Formats

The import allowlist includes:

- `.wav`
- `.mp3`
- `.flac`
- `.ogg`
- `.m4a`
- `.aac`

Some manageable assets such as `.json`, `.zip`, or other project support files may be handled by library/export workflows when allowed by the current import flow, but playback depends on Chromium and OS codec support.

## Known Limitations

- No audio editing.
- No audio conversion or transcoding.
- No bundled app-managed ffmpeg executable.
- No AI, Whisper, LLM, OpenAI, Codex API, or cloud analysis.
- No automatic license judgment.
- No cloud backup or sync.
- Playback support depends on Chromium and the operating system.
- Unsigned Windows builds may show SmartScreen or unknown publisher warnings.
- GUI smoke should be run carefully because duplicate-window behavior was previously observed during development; the app now uses a single-instance lock.
- `electron-builder` may print duplicate dependency reference warnings. Treat them as informational only when `pack`, `dist`, and smoke checks pass.

## Verification

Record the exact output and date for each release candidate:

```bash
npm.cmd run typecheck
npm.cmd run check:i18n
npm.cmd test
npm.cmd run audit
npm.cmd run build
npm.cmd run smoke:production-entry
npm.cmd run dist:win:dir
npm.cmd run smoke:packaged-paths
npm.cmd run zip:win
npm.cmd run check:release -- --platform win
```

The Linux zip is verified in GitHub Actions with `npm run dist:linux:dir`, `npm run zip:linux`, and `npm run check:release -- --platform linux`.

## Manual QA

Complete `docs/manual-qa.md` and `docs/qa-checklist.md` on the unpacked build and the extracted Windows zip. Run a shorter Linux smoke pass on the extracted Linux zip when a Linux test machine is available.

Manual QA should confirm app launch, ko/en localization, About version, library create/open, import, playback, analysis, Similar Sounds, Export Center, diagnostics, logs, backup, trash safety, and restart/reopen flows.

## Distribution Notes

Read `docs/windows-distribution.md` before publishing. The current build is unsigned, so release notes, hashes, source availability, license, and third-party notices are important trust signals for testers.
