# Capability Matrix

| Capability | Status | Evidence | Fallback | Product decision |
|---|---|---|---|---|
| Local Node runtime | Confirmed | Node 24.14.1 | None required | Go |
| SQLite FTS5 | Confirmed | SQLite 3.51.2 in-memory probe | `better-sqlite3` packaged FTS5 | Go |
| Local port 4310 | Confirmed | Listener probe | `ATLAS_PORT` override | Go |
| Codex local MCP | Built, host install blocked | Plugin/skill validators, MCP build; packaged `codex.exe` denied shell execution | Local Web | Conditional Go; install in Codex UI or a permitted CLI context |
| Codex current-context capture | Adapter ready, host invocation unverified | `capture` MCP tool compiles against local API | Manual capture | Conditional; do not advertise until invoked in host |
| Codex history enumeration | Unsupported assumption | No public third-party history contract | ChatGPT Export | Do not promise |
| Apps SDK embedded UI in target surface | Not implemented | MCP is deliberately UI-independent | Structured text | No-Go for embedded cards; does not block plugin |
| Tailscale Serve | To verify | Tailnet-only network probe | Loopback Web | P1 |
| BitLocker protection | Unknown | Non-admin status check denied | Explicit warning | Do not claim encryption |
| Background host-model inference | Not available by default | MCP is not a model runtime | Queue until interactive session | No background AI |
