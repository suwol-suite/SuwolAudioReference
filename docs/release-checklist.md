# Suwol Audio Reference Release Checklist

This checklist is for preparing an MVP Windows release candidate. The MVP should remain focused on local library management, local analysis suggestions, localization, diagnostics, and Windows packaging stability.

## Scope Lock

- No new feature work is included after the release branch is cut.
- Only release blockers, QA fixes, packaging fixes, and documentation fixes are accepted.
- Known limitations are recorded in the release notes.

## Version And Metadata

- `package.json` version is correct.
- `package.json` version is `0.1.2` for this release candidate.
- `package.json` `productName`, `appId`, `description`, and `license` are correct.
- `package.json` `engines.node` requires Node 24 or newer.
- Windows and Linux build metadata remains zip-first via unpacked `dir` outputs plus the repo zip scripts.
- Installer, AppImage, deb, rpm, Snap, Flatpak, code-signing, and auto-update targets are not introduced in 0.1.2.
- `README.md` reflects the supported platform, formats, library layout, and backup method.
- `docs/manual-qa.md`, `docs/release-notes-0.1.2.md`, `docs/known-issues.md`, and `docs/windows-distribution.md` are present.
- `LICENSE` is present.
- `THIRD_PARTY_NOTICES.md` is present and reviewed against the final lockfile.
- Generated icons exist under `assets/brand/` and `build/`.

## Build Verification

Run from a clean checkout with dependencies installed:

```bash
npm.cmd run icons:generate
npm.cmd run typecheck
npm.cmd test
npm.cmd audit
npm.cmd run check:i18n
npm.cmd run build
npm.cmd run smoke:production-entry
npm.cmd run pack
npm.cmd run smoke:packaged-paths
```

For a Windows zip release, also run:

```bash
npm.cmd run dist:win:dir
npm.cmd run zip:win
npm.cmd run checksums
npm.cmd run check:release -- --platform win
npm.cmd run check:release -- --platform win --require-checksums
```

For Linux, confirm the GitHub Actions Linux job runs:

```bash
npm run dist:linux:dir
npm run zip:linux
npm run check:release -- --platform linux
```

## Manual QA

- Complete `docs/qa-checklist.md` on the unpacked build.
- Complete `docs/manual-qa.md` on the unpacked build.
- Complete a short smoke pass on the extracted Windows zip.
- Complete a short smoke pass on the extracted Linux zip when a Linux test machine is available.
- Confirm a second app launch focuses/restores the existing window and does not leave two main windows open.
- Confirm Korean and English are both usable.
- Confirm app launch, library create/open, import WAV/MP3/OGG, corrupted-file import, playback, analysis, similar sounds, diagnostics, backup, Export Center, trash/restore, restart, and reopen flows work in the packaged build.
- Confirm Sound Usage Board project creation, bulk import, custom templates, candidate selected/rejected/approved states, variant selection, validation navigation, and dashboard counts.
- Confirm Sound Board shortcuts open Export Center prefilled with the active game project and selected project export target.
- Confirm Project Sound Pack preview/export, Project Manifest export, Project Missing Report export, and Project Codex Instruction export from Export Center.
- Confirm Sound Work TODO queues, workflow notes, candidate review notes, Project Sound Style Guide, Project Checklist, and Sound Request Markdown/CSV/JSON preview/export.
- Confirm Project Style Guide Markdown and Project Checklist Markdown export through Export Center.
- Confirm workflow/style/checklist/request exports do not translate user-authored data and exclude absolute paths by default unless explicitly enabled.
- Confirm project export history records success and failure rows and that deleting a history row does not remove output files.
- Confirm original audio files and engine project folders are unchanged after project exports.
- Confirm logs can be opened from Settings and renderer fallback errors do not show raw stacks in the UI.
- Confirm adding a future language is documented and `check:i18n` passes.

## Artifact Review

- `release\win-unpacked\Suwol Audio Reference.exe` launches.
- `release\win-unpacked\resources` contains the packaged app resources.
- The Windows zip artifact is present when `npm.cmd run zip:win` is used.
- The Linux zip artifact is present in the GitHub Actions Linux job.
- `SHA256SUMS.txt` is generated for release zip verification.
- `npm.cmd run smoke:packaged-paths` passes after `pack` and again after `dist`.
- `npm.cmd run check:release` passes after final artifacts are produced.
- Release artifacts do not include source-only temporary files.
- Release artifacts do not include generated QA fixture audio.
- If `electron-builder` prints `duplicate dependency references`, record it as informational when pack/dist/smoke pass.
- Windows zip structure includes `win-unpacked\Suwol Audio Reference.exe`.
- `check:release -- --platform win` validates the versioned release notes, known issues, manual QA, QA checklist, release checklist, distribution guides, icons, app metadata, Node 24 engine metadata, zip, unpacked executable, and packaged resources.

## Release Notes

Include:

- Version and commit hash.
- Supported OS.
- Main MVP capabilities.
- Known limitations.
- Verification command results.
- Manual QA result and tester.
- Third-party notice review status.
- Known build notes, including any informational electron-builder warnings.
- Unsigned Windows distribution guidance and hash publication plan.
- Manual QA status for Sound Board, Export Center project source, Project Sound Pack, Project Manifest, Project Missing Report, Project Codex Instruction, and export history.

## GitHub Release Tags

- Main branch pushes create Windows/Linux zip workflow artifacts.
- Release tags use the `vX.Y.Z` format, for example `v0.1.2`.
- The tag must match `package.json` version exactly, with a leading `v`.
- `npm run check:release-tag -- --tag=vX.Y.Z` must pass before pushing a release tag.
- Tag pushes create a GitHub Release and upload Windows/Linux zip assets.
- Before creating a tag, confirm `package.json` version and the matching `docs/release-notes-X.Y.Z.md` file exist.
- Do not tag from an unverified working tree.

Release command:

```bash
git tag v0.1.2
git push origin v0.1.2
```

Do not run the tag commands until the release owner has reviewed the final working tree, artifacts, checksums, manual QA notes, and GitHub Actions status.

## Post-Release

- If the project is under version control, the release owner may tag the verified commit outside this stabilization task.
- Archive release artifacts outside the repository.
- Keep the generated Windows/Linux zip checksums with the release notes.
