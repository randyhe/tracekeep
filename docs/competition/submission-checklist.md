# OpenAI Build Week Submission Checklist

Official deadline: **2026-07-21 5:00 PM PDT / 7:00 PM CDT**.
Internal target (missed): **2026-07-20 7:00 PM CDT**. The official deadline is
the controlling date.

## Completed

- [x] Category selected: Apps for Your Life.
- [x] Public MIT-licensed repository available.
- [x] Public repository PR merged and privacy-scanned.
- [x] Windows x64 v0.4.1 package built and validated locally.
- [x] Staged and extracted package validation passed.
- [x] Independent bundled-Node-only clean-room run passed.
- [x] Validated v0.4.1 ZIP and `.sha256` published in GitHub Release.
- [x] Judge testing does not require a rebuild, API key, admin account, or login.
- [x] Devpost English description drafted.
- [x] Capability boundaries and pre-existing-project extension documented.
- [x] Codex/MCP protocol probe completed with honest Experimental fallback.
- [x] Record the automatic-second-brain demo with synthetic data.
- [x] Generate English narration, burned captions, and `.srt`.
- [x] Mechanically validate the sub-three-minute replacement MP4.
- [x] Update local video validation metadata.
- [x] Publish and verify the public YouTube link.

## Agent-owned work

- [x] Automatic second-brain source changes passed GitHub Actions and were
  squash-merged through PR #18.
- [x] Current Windows release source published through PR #22; GitHub Actions
  passed before squash merge.
- [x] The `v0.4.0` release points to commit
  `a8a6b8399e5780aedca0d47739d7b02b549395bd`; its ZIP and checksum assets are
  public, and GitHub reports SHA-256
  `f6963f879892946ef1a7cba1860828c7f10221545fb9c50ca20bcd132ae9288d`.
- [x] Privacy hardening shipped through PR #31. The `v0.4.1` release points to
  merge commit `a193f78a09a24835081ce92dc66e1386bae210c6`; its public Windows ZIP reports
  SHA-256 `dcd19ad230fbe9619e7b89bcdd883d5621efd5651e2645d08397e5072d768cc7`.
- [x] Plugin validation, forbidden-artifact scan, privacy scan, and
  `git diff --check` passed.
- [x] Authenticated Windows Stop-hook probe, idempotent replay, Learning UI,
  Review UI, and automatic-capture toggle passed on isolated data.
- [x] Product-owner Chat-first UAT passed: an ordinary meaningful turn was
  captured automatically and recalled with its source from a separate task.
- [x] README describes how Codex and GPT-5.6 accelerated the work and which
  consequential product decisions remained human-owned.

## Product-owner final review

- [x] Review the final Codex-first video and captions. The obsolete
  dashboard-first encodes are not in scope.
- [x] Review the final Devpost text and public repository links.
- [x] Record the core Codex project Session ID privately in the required Devpost
  field.
- [x] Upload the final MP4 to publicly visible YouTube.
- [x] Paste the YouTube URL and Session ID into Devpost.
- [ ] Submit the project before the internal deadline.
- [x] Recheck public repository, Release, YouTube, and testing links before the
  official deadline.

## Non-blocking quality follow-up

- [ ] Complete UAT-017 blind candidate usefulness review. This is a project
  quality gate, not an official submission requirement, and must not be marked
  complete without the product owner's 40 blind ratings.

## Rejected claims

- A completed 14-day real-user Alpha.
- Proven retention or recovery of real missed commitments.
- Complete ChatGPT or Codex history access.
- Installed Codex MCP tools before a host-level post-restart probe.
- A whole-machine or browser-wide no-network guarantee.
- Absolute zero cost in every environment.
