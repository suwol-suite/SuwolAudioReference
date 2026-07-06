# Suwol Audio Reference 0.1.2

## Summary

Suwol Audio Reference 0.1.2 is the cleanup release for the Game Project, Sound Usage Board, Project Sound Pack, Export Center, and Sound Workflow productivity work that landed on `main` after the existing `v0.1.1` tag.

The `v0.1.1` GitHub Release remains tied to its historical tag. Version 0.1.2 is the next release candidate that packages the current main-branch workflow features without moving or rewriting the existing 0.1.1 tag.

All analysis, similarity, validation, and export work stays local. The app does not call AI, LLM, Whisper, OpenAI, Codex, cloud analysis, or cloud backup services.

## Highlights

- Game Project management.
- Sound Usage Board for usage keys, status, priority, categories, loop needs, variants, notes, and candidates.
- Bulk usage item import with preview counts before rows are written.
- Built-in and custom usage templates.
- Candidate asset workflow with selected, approved, rejected, restored, and variant states.
- Similar candidate suggestions based on local feature vectors and library metadata.
- Missing, risk, validation, and dashboard review workflow.
- Project Sound Pack Builder.
- Export Center game-project source.
- Project Manifest, Project Missing Report, and Project Codex Instruction export.
- Project export presets and Local export history.
- Sound Work TODO Board for missing, candidate, review, selected, approved, deferred, and risk queues.
- Workflow notes for assignee, due label, work note, review note, and decision note.
- Candidate review notes and scores for pros, cons, decision reason, usage fit rating, loudness fit, loop fit, and mood fit.
- Project Sound Style Guide and Project Checklist.
- Sound Request Markdown, CSV, and JSON export.
- Project Style Guide and Project Checklist Markdown export.
- Korean and English localization.
- Windows zip-first distribution with Linux zip, AppImage, and tar.gz release assets.

## Distribution

- Windows x64 zip: `Suwol.Audio.Reference.0.1.2.Windows.x64.zip`.
- Linux x64 zip: `Suwol.Audio.Reference.0.1.2.Linux.x64.zip`.
- Linux AppImage and tar.gz assets are generated on tag release builds.
- `SHA256SUMS.txt` is generated for release zip verification.
- `checksums.txt` and `checksums.txt.asc` are generated for signed Linux asset verification and are published with `suwol-release-public-key.asc`.
- Windows builds are unsigned.
- Distribution remains portable. There is no installer as the primary release artifact.

## Verification

The Windows release candidate should be verified with:

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
npm.cmd run checksums
npm.cmd run check:release -- --platform win
npm.cmd run check:release -- --platform win --require-checksums
npm.cmd run check:release-tag -- --tag=v0.1.2
git diff --check
```

Observed automated test count at release-prep time: 97 tests passed.

Windows artifact:

```text
C:\Project\SuwolAudioReference\release\Suwol.Audio.Reference.0.1.2.Windows.x64.zip
```

Checksum file:

```text
C:\Project\SuwolAudioReference\release\SHA256SUMS.txt
```

Linux zip verification is performed by GitHub Actions with:

```bash
npm run dist:linux:dir
npm run zip:linux
npm run check:release -- --platform linux
```

Tag release Linux assets are generated and verified with:

```bash
npm run dist:linux:release
gpg --import suwol-release-public-key.asc
gpg --verify checksums.txt.asc checksums.txt
sha256sum -c checksums.txt
```

The tag release job downloads the Windows and Linux zip artifacts, generates `SHA256SUMS.txt`, signs the Linux asset checksum file, verifies it with the public key, and uploads the zip files, Linux AppImage/tar.gz assets, checksum files, signature, and public key to GitHub Releases.

## Known Limitations

- The Windows app is unsigned, so SmartScreen or browser download warnings may appear.
- No audio editing, trimming, normalization, conversion, or transcoding.
- No bundled app-managed ffmpeg executable.
- No GPL-family runtime dependency is intentionally added by the app.
- No AI, Whisper, LLM, OpenAI, Codex API, cloud analysis, or cloud backup.
- Unity, Unreal, MonoGame, and other engine project files are not modified directly.
- Project Sound Pack export copies files into an export folder only.
- License and credit fields are user-managed metadata and are not legal verification.
- Style guide, checklist, workflow notes, candidate review notes, and decision notes are user-authored data and are not auto-translated.
- Playback support can vary by OS and Chromium codec support.
- Linux zip/AppImage/tar.gz validation is expected to run in GitHub Actions or on a Linux machine.

## Release Handling

- Package version: `0.1.2`.
- Expected release tag: `v0.1.2`.
- The tag must match `package.json` exactly.
- Before tagging, run `npm run check:release-tag -- --tag=v0.1.2`.
- Existing `v0.1.1` tags and releases are not moved, deleted, or regenerated.
- This preparation task creates a local release-prep commit only; push, tag, and GitHub Release creation are separate release-owner actions.
