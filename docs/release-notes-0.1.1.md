# Suwol Audio Reference 0.1.1

## Summary

Suwol Audio Reference 0.1.1 is the first release candidate centered on the Game Project, Sound Usage Board, Project Sound Pack, and Export Center workflow.

This release lets a user create a game project, plan required sound usage keys, connect candidate assets, review missing/risk states, and export project-ready local files. All analysis, similarity, validation, and export work stays local. The app does not call AI, LLM, Whisper, OpenAI, Codex, cloud analysis, or cloud backup services.

## Highlights

- Game Project management.
- Sound Usage Board for usage keys, status, priority, categories, loop needs, variants, notes, and candidates.
- Bulk usage item import with preview counts before rows are written.
- Built-in and custom usage templates.
- Candidate asset workflow with selected, approved, rejected, restored, and variant states.
- Sound Work TODO Board for missing, candidate, review, selected, approved, deferred, and risk queues.
- Workflow notes for assignee, due label, work note, review note, and decision note.
- Candidate review notes for pros, cons, decision reason, usage fit rating, loudness fit, loop fit, and mood fit.
- Project Sound Style Guide and Project Checklist.
- Sound Request Markdown/CSV/JSON export.
- Similar Sounds based on local feature vectors and library metadata.
- Missing, risk, validation, and dashboard review workflow.
- Sound Board shortcuts that open Export Center prefilled instead of writing files directly.
- Export Center game-project source.
- Project Sound Pack export.
- Project Manifest export.
- Project Missing Report export.
- Project Codex Instruction export.
- Project Style Guide and Project Checklist Markdown export.
- Project export presets.
- Local export history for success and failure results.
- Unity, Unreal, and MonoGame usage mapping exports.
- Korean and English localization.

## Export Outputs

- Project Sound Pack folders.
- Generic game-audio manifest JSON.
- Unity manifest JSON.
- Unreal manifest JSON and CSV.
- MonoGame manifest JSON and content list.
- Codex instruction Markdown and JSON context.
- Sound Request Markdown, CSV, and JSON.
- Project Style Guide Markdown.
- Project Checklist Markdown.
- `README.md`, `credits.md`, `missing-sounds.md`, `validation-report.md`, and metadata CSV files inside project sound packs.

## Verification

The Windows release candidate was verified with:

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
git diff --check
```

Observed automated test count: 97 tests passed.

Windows artifact:

```text
C:\Project\SuwolAudioReference\release\Suwol Audio Reference 0.1.1 Windows x64.zip
```

Linux zip verification is performed by GitHub Actions with:

```bash
npm run dist:linux:dir
npm run zip:linux
npm run check:release -- --platform linux
```

## Known Limitations

- The Windows app is unsigned, so SmartScreen or browser download warnings may appear.
- Distribution is zip-first. There is no installer in 0.1.1.
- GUI manual QA must still be performed by a human on the packaged app before publishing.
- No audio editing, trimming, normalization, conversion, or transcoding.
- No bundled app-managed ffmpeg executable.
- No GPL-family runtime dependency is intentionally added by the app.
- No AI, Whisper, LLM, OpenAI, Codex API, cloud analysis, or cloud backup.
- Unity, Unreal, MonoGame, and other engine project files are not modified directly.
- Project Sound Pack export copies files into an export folder only.
- License and credit fields are user-managed metadata and are not legal verification.
- Style guide, checklist, workflow notes, candidate review notes, and decision notes are user-authored data and are not auto-translated.
- Playback support can vary by OS and Chromium codec support.
- Linux zip validation is expected to run in GitHub Actions or on a Linux machine.

## Release Handling

- Package version: `0.1.1`.
- Expected release tag: `v0.1.1`.
- The tag must match `package.json` exactly.
- Before tagging, run `npm run check:release-tag -- --tag=v0.1.1`.
- This preparation task did not stage, commit, push, tag, or create a GitHub Release.
