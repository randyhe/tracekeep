# Capability Matrix

| Capability | Status | Evidence | Fallback | Product decision |
|---|---|---|---|---|
| Local Node runtime | Confirmed | Node 24.14.1 | None required | Go |
| SQLite FTS5 | Confirmed | SQLite 3.51.2 in-memory probe | `better-sqlite3` packaged FTS5 | Go |
| Local port 4310 | Confirmed | Listener probe | `ATLAS_PORT` override | Go |
| Codex local MCP | Protocol verified, host install blocked | All 11 tools listed over stdio; typed capture and `get_today` passed against isolated port 4388; packaged `codex.exe` denied shell execution | Installed Atlas skill over loopback HTTP | Conditional Go; install in Codex UI and verify in a new task |
| Codex current-context capture | Skill fallback verified; MCP host invocation unverified | Isolated Skill capture returned source `codex` and Reference, Decision, and Open Loop candidates; MCP capture also returned source `codex` | Skill invokes the local HTTP API | Conditional for MCP, Go for explicit Skill capture |
| Codex history enumeration | Unsupported assumption | No public third-party history contract | ChatGPT Export | Do not promise |
| Apps SDK embedded UI in target surface | Not implemented | MCP is deliberately UI-independent | Structured text | No-Go for embedded cards; does not block plugin |
| Tailscale Serve | To verify | Tailnet-only network probe | Loopback Web | P1 |
| BitLocker protection | Unknown | Non-admin status check denied | Explicit warning | Do not claim encryption |
| Background host-model inference | Not available by default | MCP is not a model runtime | Queue until interactive session | No background AI |
