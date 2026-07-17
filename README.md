# Atlas

**Atlas — Local-First AI Memory & Action System** helps people remember what mattered and resume what was interrupted. Its primary experience lives inside Codex conversations: users can explicitly ask Atlas to remember an idea, preserve a decision, recover unfinished work, see today's focus, or search prior evidence without switching to another app. The Web dashboard is the optional workspace for batch review, sources, backup, and settings.

Atlas is an **Apps for Your Life** project for OpenAI Build Week. It is not a general chat archive and does not claim access to all ChatGPT or Codex history.

## Install on Windows

Atlas is distributed as a green, no-admin Windows release:

1. Download `Atlas-Windows-x64.zip` and its `.sha256` file from [GitHub Releases](https://github.com/randyhe/atlas/releases/latest).
2. Verify the SHA-256 value, then extract the complete ZIP to a writable folder.
3. Double-click **Install Atlas.cmd**. It installs the personal Codex plugin, creates a local encrypted authentication token, starts Atlas, and opens the dashboard.
4. Open a new Codex task and say: **“Remember this in Atlas: finish the demo video.”**

No administrator account, Node.js installation, package manager, API key, or hosted Atlas account is required. After installation, use **Start Atlas.cmd** whenever Atlas is not already running. The Web dashboard is optional; normal capture and recall happen in Codex conversations.

To remove the Codex integration, double-click **Uninstall Atlas.cmd**. It unregisters the plugin and local marketplace but preserves `work/data`. Delete the extracted Atlas folder only after you have backed up or intentionally discarded that data.

> The current release is distributed as a ZIP with a published SHA-256 checksum. Windows Authenticode signing is planned but requires a trusted code-signing certificate; the project does not claim that unsigned scripts are digitally signed.

## V1 guarantees

- Local capture, review, open-loop tracking, and FTS search work without an AI API key.
- SQLite is the runtime source of truth.
- Git exports are sanitized and intentionally incomplete for restricted data.
- Conversation capture records `codex` as its source and supports Open Loop, Decision, and Reference candidates.
- Codex integration is the preferred interaction layer, while the local API and Web dashboard preserve independent access to the data.
- The default competition configuration has a $0 external service budget and does not enable usage-based AI APIs. Local electricity, storage, connectivity, and an existing subscription are outside that statement.
- The Windows release generates a 256-bit per-user token protected with Windows DPAPI. Browser access uses an HttpOnly, SameSite session cookie; Codex MCP calls use the same local token.
- The service binds only to `127.0.0.1`. It never creates a firewall exception, listens on the LAN, or enables a public tunnel.

## Golden journeys

1. Import or capture an explicit open loop, inspect its Evidence, accept it in Review, move it through Today, then mark it done or scheduled.
2. Capture the same intent from a second source, inspect the **Possible duplicate** hint, merge the Evidence, then undo only the added Evidence link.
3. Import restricted or adversarial text and verify that it remains inert data, is redacted from ordinary responses, and does not enter Search or sanitized exports.

## Architecture

```text
Codex conversation --> skill / MCP --\
                                      +--> atlasd HTTP API --> SQLite schema v2
Local Web review workspace ----------/          |               | business tables
Source imports --> local extractor ----------+               | audit_events
                                                              ` outbox_events
```

`atlasd` is the only SQLite writer. Imports, URLs, and commands are always treated as untrusted text. The deterministic `competition-1` extractor reads user-authored ChatGPT messages only, emits at most three candidates in Decision → Waiting → Open Loop order, and sends every result to Review.

## Local entry points

- Codex: say “Remember this in Atlas,” “What unfinished work should I resume?”, or “Search Atlas for …”. The installed skill uses the local API fallback when MCP is not exposed.
- Plugin: the Windows installer registers the package-local `atlas-release` marketplace and installs `atlas@atlas-release`; open a new Codex task after installation.
- Web review workspace: the installer opens the selected loopback port. Atlas prefers 4310 and safely falls back through 4319.

## Development

```powershell
pnpm install
pnpm check
pnpm build
pnpm start
```

Open `http://127.0.0.1:4310`. On Windows, runtime data defaults to `%LOCALAPPDATA%\Atlas` so an active SQLite database is not placed inside the OneDrive repository. Use `ATLAS_DATA_DIR` to select a different local directory.

For front-end development, run `pnpm dev` and `pnpm dev:web` in separate terminals, then open `http://127.0.0.1:4311`.

## Import endpoints

- `POST /api/v1/imports/manual`
- `POST /api/v1/imports/daily-log`
- `POST /api/v1/imports/chatgpt-export`

Imported text is always treated as untrusted data and every candidate enters Review during Alpha.

ChatGPT Export is limited to 12 MB per HTTP request and 1,000 conversations. It is a manual historical fallback, not automatic history access.

## Competition testing

The repeatable synthetic harness is documented in [`tests/competition/README.md`](tests/competition/README.md). The visible 30-sample Development set produces Open Loop TP 18 / FP 0 / FN 0 and Decision TP 6 / FP 0 / FN 0. After rule freeze, QA generated and ran the separate 50-sample Holdout once: Open Loop TP 35 / FP 0 / FN 0 with a Wilson 95% precision/recall interval of 90.11%–100%. Ten samples remain explicitly pending BA/QA double-label and user arbitration. These results are not retention evidence or a real 14-day Alpha.

The dated Codex/MCP probe is in [`docs/competition/capability-probe-2026-07-15.md`](docs/competition/capability-probe-2026-07-15.md). A later isolated protocol probe verified all 11 MCP tools and a typed `codex` capture against a non-production database. Atlas MCP tools are still not exposed by this current host task, so MCP remains **Experimental**; the installed Atlas skill now provides a verified loopback HTTP fallback without forcing the user into the dashboard.

Windows release packaging and judge instructions are in [`packaging/windows/README-TESTING.md`](packaging/windows/README-TESTING.md). The release builder bundles a matching Node runtime and a self-contained MCP server. Normal installation creates portable data under the extracted release; `--demo` uses a separate synthetic data directory. Neither mode reads the normal `%LOCALAPPDATA%\Atlas` database.

## Security, trust, and license

- Atlas is local-first and imported text is always inert, untrusted data.
- The installer does not request elevation, edit the registry, or change Windows Firewall.
- Ports are restricted to loopback `127.0.0.1:4310-4319`; if all are occupied, startup stops safely.
- Authentication secrets are protected for the current Windows user with DPAPI and are never committed to Git or included in the ZIP.
- Release ZIPs publish SHA-256 hashes. Authenticode status is stated explicitly and never implied.
- Atlas source code is released under the [MIT License](LICENSE). Bundled runtime dependencies remain under their own licenses; see [Third-Party Notices](THIRD-PARTY-NOTICES.md).

## Human and Codex contribution

The user chose the product promise, review-first workflow, schema v2 boundary, privacy model, zero-paid-provider configuration, competition claims, and release gates. Codex assisted with implementation, tests, architecture review, synthetic evaluation, and packaging. Exact model-version claims should be made only when the submission host exposes verifiable model metadata; this repository does not invent a minor model version.

The post-2026-07-13 implementation history is preserved in Git, beginning with `a5bcf40` (local alpha baseline) and `6ab639e` (P0 review and safe restore), followed by the Build Week competition commits on this branch.
