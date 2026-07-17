# Atlas Windows Installation and Testing Guide

Atlas is a local-first memory and action system. This green package installs the personal Codex plugin and runs Atlas without an administrator account, a separate Node.js installation, pnpm, a hosted account, or a rebuild.

## Install Atlas

1. Compare the ZIP against the published `.sha256` file.
2. Extract the entire ZIP to a writable folder. Do not run it from inside the ZIP viewer.
3. Double-click `Install Atlas.cmd`.
4. Open a new Codex task and ask Atlas to remember an idea or show unfinished work.

Installation creates a package-local plugin and marketplace under `<extracted release>\work\marketplace`, then registers `atlas@atlas-release` with Codex. Atlas data remains under `<extracted release>\work\data`. Reinstalling backs up an existing package-local Atlas plugin folder instead of deleting it.

`Uninstall Atlas.cmd` removes the Codex plugin and marketplace registration and stops only this release's verified bundled Node process. It intentionally preserves `work/data`; deleting the extracted folder is the final, user-controlled data removal step.

## Start the demo

1. Install Atlas once as described above.
2. Double-click `Start Atlas.cmd`.
3. Wait for the browser to open the Atlas **Today** page.

The launcher prefers port `4310`, falls back through `4319`, persists the selected port for Codex, and binds only to `127.0.0.1`. It does not add a firewall rule. If Windows shows a firewall prompt, keeping inbound network access blocked is compatible with Atlas's loopback-only design. The release contains no prebuilt SQLite database and never reads or writes the normal `%LOCALAPPDATA%\Atlas` data directory.

For the synthetic competition dataset, run `Start Atlas.cmd --demo`. Demo data is isolated under `work/demo-data`; normal user data remains under `work/data`.

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
- A 256-bit authentication token is generated locally and protected with Windows DPAPI for the current user.
- Browser authentication is exchanged for an HttpOnly, SameSite cookie. Codex MCP reads the protected local token at startup.
- The package is green: no administrator rights, registry writes, Windows service, firewall exception, or uninstaller registration.
- The ZIP is not claimed to be Authenticode-signed unless the published release explicitly says so.
- Synthetic test results do not replace a real 14-day user alpha.
- If Codex integration is shown, it reflects a separately reproduced host capability probe; the Web dashboard remains the complete entry point.

## Integrity

Compare the downloaded ZIP with the published `.sha256` file before extracting it:

```powershell
Get-FileHash .\Atlas-Windows-x64.zip -Algorithm SHA256
```

The source is licensed under MIT. See `LICENSE` and `THIRD-PARTY-NOTICES.md` in this package.
