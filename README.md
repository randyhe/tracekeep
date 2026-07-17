# Atlas

**Atlas — Local-First AI Memory & Action System** helps people who start many conversations, searches, and projects recover the important follow-ups that would otherwise disappear. It turns explicitly stated actions and decisions into sourced, review-first candidates that the user can edit, accept, merge, schedule, complete, dismiss, or undo.

Atlas is an **Apps for Your Life** project for OpenAI Build Week. It is not a general chat archive and does not claim access to all ChatGPT or Codex history.

## V1 guarantees

- Local capture, review, open-loop tracking, and FTS search work without an AI API key.
- SQLite is the runtime source of truth.
- Git exports are sanitized and intentionally incomplete for restricted data.
- Codex integration is an optional convenience layer and never a dependency for local data access.
- The default competition configuration has a $0 external service budget and does not enable usage-based AI APIs. Local electricity, storage, connectivity, and an existing subscription are outside that statement.

## Golden journeys

1. Import or capture an explicit open loop, inspect its Evidence, accept it in Review, move it through Today, then mark it done or scheduled.
2. Capture the same intent from a second source, inspect the **Possible duplicate** hint, merge the Evidence, then undo only the added Evidence link.
3. Import restricted or adversarial text and verify that it remains inert data, is redacted from ordinary responses, and does not enter Search or sanitized exports.

## Architecture

```text
Codex skill / experimental MCP ---\
                                  +--> atlasd HTTP API --> SQLite schema v2
Local Web dashboard --------------/          |               | business tables
Source imports --> local extractor ----------+               | audit_events
                                                              ` outbox_events
```

`atlasd` is the only SQLite writer. Imports, URLs, and commands are always treated as untrusted text. The deterministic `competition-1` extractor reads user-authored ChatGPT messages only, emits at most three candidates in Decision → Waiting → Open Loop order, and sends every result to Review.

## Local entry points

- Web: `http://127.0.0.1:4310` after a production build and start
- Codex: optional `plugins/atlas` plugin backed by a local MCP adapter; host installation remains capability-gated

Download the judge-ready Windows package from the
[`v0.1.0-build-week` release](https://github.com/randyhe/atlas/releases/tag/v0.1.0-build-week).
Verify its adjacent `.sha256` file before extracting it.

## Optional local Codex plugin

The repository includes a local plugin marketplace at
`.agents/plugins/marketplace.json`. After cloning the repository, register the
repository marketplace and install Atlas with the Codex CLI:

```powershell
codex plugin marketplace add .
codex plugin add atlas@personal
```

Restart the ChatGPT desktop app and start a new task so the host can load the
plugin and its local MCP tools. If installation is unavailable, the Atlas skill
and Web dashboard remain the supported fallback. The final dated probe is in
[`docs/competition/codex-probe-2026-07-16.md`](docs/competition/codex-probe-2026-07-16.md).

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

The repeatable synthetic harness is documented in [`tests/competition/README.md`](tests/competition/README.md). The visible 30-sample Development set produces Open Loop TP 18 / FP 0 / FN 0 and Decision TP 6 / FP 0 / FN 0. After rule freeze, QA generated and ran the separate 50-sample Holdout once: Open Loop TP 35 / FP 0 / FN 0 with a Wilson 95% precision/recall interval of 90.11%–100%. Ten samples remain explicitly pending BA/QA double-label and user arbitration. These results are not retention evidence or a real 14-day Alpha. The consolidated public result and remaining human conditions are in [`docs/competition/readiness-2026-07-16.md`](docs/competition/readiness-2026-07-16.md).

The dated Codex/MCP probe is in [`docs/competition/capability-probe-2026-07-15.md`](docs/competition/capability-probe-2026-07-15.md). In this environment the Web entry point passed, while Atlas MCP tools were not exposed by the Codex host and therefore remain **Experimental** with a text/Web fallback.

Windows release packaging and judge instructions are in [`packaging/windows/README-TESTING.md`](packaging/windows/README-TESTING.md). The release builder bundles a matching Node runtime, binds only to `127.0.0.1`, seeds synthetic data through the local HTTP API, and never uses the normal `%LOCALAPPDATA%\Atlas` database.

## Human and Codex contribution

The user chose the product promise, review-first workflow, schema v2 boundary, privacy model, zero-paid-provider configuration, competition claims, and release gates. Codex assisted with implementation, tests, architecture review, synthetic evaluation, and packaging. Exact model-version claims should be made only when the submission host exposes verifiable model metadata; this repository does not invent a minor model version.

The post-2026-07-13 implementation history is preserved in Git, beginning with `a5bcf40` (local alpha baseline) and `6ab639e` (P0 review and safe restore), followed by the Build Week competition commits on this branch.
