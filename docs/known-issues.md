# Known Issues

This document lists known limitations and release notes for Suwol Audio Reference 0.1.2. These items should not block the MVP when the documented workaround is acceptable and the automated release gates pass.

## Unsigned Windows App Warning

- Symptom: Windows SmartScreen, Microsoft Defender, or browsers may show an unknown publisher warning.
- Impact: Testers may need extra confidence before running the Windows zip or Linux release artifact.
- Temporary handling: Publish hashes, release notes, license, third-party notices, and artifact source information. Ask testers to verify the source and hash before running.
- Future plan: Evaluate OV or EV code signing in a later release phase.

## Electron Builder Duplicate Dependency References

- Symptom: `electron-builder` may print duplicate dependency reference warnings for packages such as `react` or `loose-envify`.
- Impact: The warning is noisy but has not blocked packaging when `pack`, `dist`, and smoke checks pass.
- Temporary handling: Record the warning in release notes if it appears.
- Future plan: Revisit package metadata cleanup if the warning changes into a build failure or affects packaged output.

## Duplicate GUI Window History

- Symptom: A prior manual GUI smoke attempt produced two windows.
- Impact: Manual QA could be confusing if multiple app starts are launched at once.
- Temporary handling: The app now uses `app.requestSingleInstanceLock()`. During QA, launch one GUI command at a time and confirm a second launch focuses the existing window.
- Future plan: Add deeper automated GUI smoke only when it can run without creating multiple interactive windows.

## Unsupported Playback Codecs

- Symptom: Some imported files may appear as assets but fail playback if Chromium or the OS cannot decode them.
- Impact: The asset can still be organized, diagnosed, or exported, but playback controls may show an unsupported state.
- Temporary handling: Use diagnostics and the Unplayable smart folder to find these files.
- Future plan: Consider clearer codec reporting without adding conversion or ffmpeg features.

## Portable Distribution Without Installers

- Symptom: 0.1.2 publishes a Windows zip and Linux zip/AppImage/tar.gz artifacts instead of installers or app-store style packages.
- Impact: Windows users must extract the zip and run the executable from the extracted folder. Linux users may need to set executable permission before running AppImage or extracted builds.
- Temporary handling: Publish release notes, hashes, signed Linux checksum files, source information, and distribution guides next to the release artifacts.
- Future plan: Evaluate installers, native packages, or code-signed app binaries only after the MVP release workflow is stable.

## Linux AppImage Auto Update Scope

- Symptom: Automatic update checks are available only for packaged Linux AppImage builds.
- Impact: Windows zip, Linux tar.gz, Linux zip, development mode, draft releases, and releases missing `latest-linux.yml` will not auto-update.
- Temporary handling: Use the Settings Updates tab to open GitHub Releases and download manually when auto update is unsupported or metadata is missing.
- Future plan: Keep Windows signing/store strategy, Snap, Flatpak, app stores, and broader update channels in later phases.

## Release Status Dashboard Asset Names

- Symptom: Settings Updates shows expected asset names for the current app version. Windows/Linux zip names come from the repository zip script, while Linux AppImage/tar.gz names follow electron-builder output.
- Impact: If a future workflow renames AppImage or tar.gz files, the dashboard may need its release status helper updated to match the new release assets.
- Temporary handling: Compare the dashboard with the GitHub Release asset list during release QA.
- Future plan: Keep the helper aligned with the release workflow whenever distribution naming changes.

## Engine Project Files Are Not Modified

- Symptom: Project Manifest, Project Sound Pack, Unity, Unreal, and MonoGame exports create local handoff files but do not patch game projects directly.
- Impact: Users must manually import or copy generated manifests/lists/audio into their engine project if desired.
- Temporary handling: Review generated `README.md`, manifests, and content lists inside the export folder.
- Future plan: Keep direct engine project mutation out of 0.1.2 unless a later phase explicitly scopes an integration.

## Large Library Performance Expectations

- Symptom: Very large libraries can take longer to import, analyze, search, or export.
- Impact: Long-running operations may require patience, especially on slower disks.
- Temporary handling: Use paged browsing, Load More, smart folders, and diagnostics. Avoid selecting the entire library unless needed.
- Future plan: Continue profiling pagination, analysis queue behavior, and export previews with 1,000+ file fixture sets.

## Missing Files In Link Mode

- Symptom: Link-mode assets become missing when the original file is moved, renamed, deleted outside the app, or stored on a disconnected drive.
- Impact: Playback and export may fail until the source is restored or relinked.
- Temporary handling: Use diagnostics, missing-file views, and relink tools. Link-mode permanent delete never deletes the original source file.
- Future plan: Improve relink suggestions and drive availability messaging.

## No Automatic License Judgment

- Symptom: The app stores source/license/credit fields but does not determine whether an asset is legally usable.
- Impact: Export warnings can help review metadata, but they are not legal advice.
- Temporary handling: Review asset licenses manually before shipping a game or public project.
- Future plan: Add better metadata templates without making legal determinations.

## No Cloud Backup Or Sync

- Symptom: Libraries are local folders and SQLite files only.
- Impact: Data is not backed up unless the user copies or backs up the library folder.
- Temporary handling: Use the library backup workflow or copy the entire library root, including `.suwol-audio`.
- Future plan: Keep cloud backup out of the MVP unless a later phase explicitly scopes it.

## No Audio Editing Or Conversion

- Symptom: The app does not trim, normalize, transcode, convert, or edit audio.
- Impact: Exported sound packs copy original audio files as-is.
- Temporary handling: Use separate audio tools for editing or conversion before importing or after export.
- Future plan: Keep editing/conversion out of this MVP to avoid changing source files or adding ffmpeg/GPL dependencies.

## Project Sound Pack Is Copy-Only

- Symptom: Project Sound Pack export copies selected files into an export folder and writes manifests, reports, and metadata.
- Impact: The export does not rename, move, edit, normalize, or transcode original source files. Missing selected source files block export.
- Temporary handling: Use the preview, warning acknowledgement, missing report, validation report, and output tree before exporting.
- Future plan: Preserve non-destructive export behavior as the default safety boundary.

## No Automatic Duplicate Deletion

- Symptom: Duplicate manager can identify duplicate content hashes, but it does not permanently delete duplicates automatically.
- Impact: Cleanup requires explicit user action and a trash step.
- Temporary handling: Move duplicates to trash first, review, then permanently delete only safe copy-mode library-owned files.
- Future plan: Preserve this safety-first flow unless a future release adds stronger review tooling.
