# Atlas V1 Implementation Status

Date: 2026-07-21

## Production-local activation

- The temporary `.runtime` browser-test instance was stopped on 2026-07-15.
- On Windows, the active service uses `%LOCALAPPDATA%\Atlas\atlas.sqlite` by default.
- Loopback Web returned HTTP 200, SQLite integrity returned `ok`, and the user-level Atlas Skill health check returned `ready`.
- The production-local database started empty: zero Today items, pending reviews, and sources.
- Before the schema 2 activation, an online SQLite backup was created and passed `quick_check=ok`.
- The production-local service was restarted on the v0.3.0 build and reports `schemaVersion: 4` and `integrity: ok`.

## Delivered local Alpha core

- Local Web with Today, Capture, Learning, Search, Review, Sources, and Settings.
- Fastify `atlasd` bound to loopback and serving the production Web build.
- SQLite business tables, FTS5, forward migration, audit/outbox records, idempotency, optimistic concurrency, online backup, and sanitized export.
- Manual, Daily Log, and native ChatGPT Export import endpoints.
- Trusted Codex Stop hook for meaningful completed turns, with a private local retry queue.
- Automatic personal Learning Notes for conversation conclusions, documents, papers, and URLs.
- Review-first actions, decisions, work summaries, and restricted or uncertain items.
- User-controlled automatic-capture setting and five fixed Open Loop states.
- Restricted-content redaction and exclusion from ordinary FTS/search responses.
- Zero-external-budget status and no configured paid or cloud provider.
- Codex plugin with a local Stop hook, 11 local MCP tools, and an Atlas skill.

## Gate disposition

| Gate | Decision | Evidence or condition |
|---|---|---|
| Gate 0 Capability | Conditional Go | Local core and MCP protocol smoke passed; Codex packaged CLI could not be executed from the shell, Apps UI/history remain unavailable |
| Gate 1 Baseline | Go | Requirements, architecture constraints, UX implementation, and RTM are present |
| Gate 2 Local core | Go for personal Alpha | Full Review lifecycle, schema 2 migration, privacy canary, stopped-service restore, production restart, build, and real browser flow pass |
| Gate 3 Sources | Conditional Go for personal Alpha | Manual, ChatGPT JSON, and Daily Log imports plus dedupe and injection defenses pass; streaming ZIP, checkpoints, and queued resume remain |
| Gate 4 Codex | Go for local Alpha | The release plugin was installed in Codex; a fresh task completed `get_today`, the trusted Stop hook captured a meaningful turn, and a separate task recalled it with source evidence |
| Gate 5 Mobile | Not started | Product direction is ChatGPT Direct through a remote HTTPS MCP gateway, OAuth 2.1, and outbound PC sync; the local Dashboard remains the current fallback |
| Gate 6 Alpha | Not started | Requires 14 days of real use and UAT metrics |

## P0 closure delivered

- Web Review supports pending edits, accept, reject, merge into an active Open Loop, visible outcome history, and conflict-safe undo.
- Review merge preserves the target Open Loop and maintains separately inspectable evidence links.
- Restore is a stopped-service CLI guarded by explicit confirmation, idempotency, a lifetime lock, integrity checks, a pre-restore backup, and failed-swap rollback.
- ChatGPT JSON and Daily Log imports are available in Sources, are treated as untrusted input, and always enter Review.
- The final workspace check passed 92 tests, all TypeScript checks, and all production builds.
- A real isolated-browser flow verified Capture, edit, accept, merge, target display, undo, ChatGPT JSON import, and Daily Log import.

## Honest remaining V1 gaps

- ChatGPT Export import is bounded to 12 MB and parsed in memory; streaming ZIP ingestion and checkpoint/resume remain.
- Source adapters do not yet implement incremental `discover/fetch_page/checkpoint`; MCP `sync_sources` returns an explicit unavailable fallback.
- The rebuilt v0.3.0 package, fresh-host MCP call, trusted Stop-hook capture,
  and real product-owner cross-task recall UAT passed. The broader UAT-017
  sample and 14-day Alpha remain incomplete.
- No stable public contract was found for reading all ChatGPT/Codex history; this is not a product claim.
- ChatGPT Direct mobile, its remote MCP gateway, OAuth flow, outbound PC sync, AI synthesis, Weekly Review, and all other P1/deferred items remain outside this Alpha core.
- The future remote gateway is transport only. SQLite remains the runtime authority, and full mobile conversations must not be copied by default.
- Restore has clean-room evidence but no process-level CLI regression test in the repository.
- The MCP package has a protocol smoke result but no automated test cases.
- Full WCAG audit, 10,000-record performance run, external process network audit, and 14-day Alpha UAT remain release gates.
