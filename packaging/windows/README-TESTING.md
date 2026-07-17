# Atlas Windows Testing Guide

Atlas is a local-first memory and action system. This package runs a private demo service on Windows without an administrator account, a separate Node.js installation, pnpm, or a rebuild.

## Start the demo

1. Extract the entire `Atlas-Demo-Windows-x64.zip` file to a writable folder.
2. Double-click `Start Atlas.cmd`.
3. Wait for the browser to open the Atlas **Today** page.

The launcher selects the first available port from `4310` through `4319` and binds only to `127.0.0.1`. It copies `demo-seed` into the extracted package's isolated `work/demo-data` folder on first launch, then imports three synthetic examples through the local HTTP API. The release contains no prebuilt SQLite database and never reads or writes the normal `%LOCALAPPDATA%\Atlas` data directory.

## Reset the demo

Close the Atlas process before resetting. Double-click `Reset Demo.cmd`. The reset script resolves and verifies the absolute path before deleting anything, and it can remove only `<extracted release>\work\demo-data`. It then restores the approved synthetic seed.

## Suggested review journeys

1. Import a synthetic conversation, review the extracted candidates, accept an open loop, move it through Today, and mark it done or scheduled.
2. Import the same intent from a second synthetic source, inspect the possible-duplicate hint, merge the evidence, and undo the merge.
3. Import the supplied restricted or adversarial synthetic text and verify that Atlas treats it as inert data and excludes it from ordinary search and export surfaces.

## Scope and privacy

- Atlas does not claim access to all ChatGPT or Codex history. ChatGPT Export is a manual fallback.
- Imported commands and URLs are untrusted text. Atlas does not execute them or open them.
- The demo is local-only and requires no paid API key or hosted Atlas service.
- Synthetic test results do not replace a real 14-day user alpha.
- If Codex integration is shown, it reflects a separately reproduced host capability probe; the Web dashboard remains the complete entry point.

## Integrity

Compare the downloaded ZIP with the published `.sha256` file before extracting it:

```powershell
Get-FileHash .\Atlas-Demo-Windows-x64.zip -Algorithm SHA256
```
