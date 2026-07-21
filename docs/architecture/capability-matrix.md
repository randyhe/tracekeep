# Capability Matrix

| Capability | Status | Evidence | Fallback | Product decision |
|---|---|---|---|---|
| Local Node runtime | Confirmed | Node 24.14.1 | None required | Go |
| SQLite FTS5 | Confirmed | SQLite 3.51.2 in-memory probe | `better-sqlite3` packaged FTS5 | Go |
| Local port 4310 | Confirmed | Listener probe | `TRACEKEEP_PORT` override | Go |
| Codex local MCP | Protocol verified, host install blocked | All 11 tools listed over stdio; typed capture and `get_today` passed against isolated port 4388; packaged `codex.exe` denied shell execution | Installed Tracekeep skill over loopback HTTP | Conditional Go; install in Codex UI and verify in a new task |
| Codex completed-turn capture | Implemented; release validation pending | Trusted Stop hook parses the current turn, applies value/privacy gates, and calls the idempotent local turn-import endpoint | Explicit Skill capture and private retry queue | Go for local implementation; package and live-host validation required |
| Learning notes | Implemented | Personal conversation, document, paper, and URL references persist with source metadata and appear in Learning/Search | Review history and FTS5 search | Go |
| Automatic-capture control | Implemented | Local setting defaults on and can pause turn ingestion without disabling manual workflows | Disable the hook in `/hooks` | Go |
| Codex history enumeration | Unsupported assumption | No public third-party history contract | ChatGPT Export | Do not promise |
| Apps SDK embedded UI in target surface | Not implemented | MCP is deliberately UI-independent | Structured text | No-Go for embedded cards; does not block plugin |
| ChatGPT Direct mobile | Not implemented | Requires ChatGPT App, stable HTTPS MCP gateway, OAuth 2.1, and outbound PC sync | Local Codex plugin and loopback Web | Future release; do not claim in v0.3.0 |
| BitLocker protection | Unknown | Non-admin status check denied | Explicit warning | Do not claim encryption |
| Background host-model inference | Not available by default | MCP is not a model runtime | Queue until interactive session | No background AI |
