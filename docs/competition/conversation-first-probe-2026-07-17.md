# Conversation-First Atlas Probe

Date: 2026-07-17

## Scope

Verify the next Atlas product priority without touching the normal Atlas data directory:

1. explicit Codex conversation capture;
2. Open Loop, Decision, and Reference classification;
3. Codex source attribution;
4. conversational recall and state changes through the local API fallback;
5. Atlas MCP protocol behavior over stdio.

## Isolation

- Data directory: `work/conversation-first-probe-20260717`
- HTTP binding: `127.0.0.1:4388`
- Normal `%LOCALAPPDATA%\Atlas` data: not opened
- External providers: none

## Results

| Probe | Result | Evidence |
|---|---|---|
| Skill capture: Reference | Pass | Returned `saved_for_review`, candidate type `reference`, source type `codex` |
| Skill capture: Decision | Pass | Returned `saved_for_review`, candidate type `decision`, source type `codex` |
| Skill capture: Open Loop | Pass | Returned `saved_for_review`, candidate type `open_loop`, source type `codex` |
| Review listing | Pass | Returned the three isolated pending candidates |
| Sourced search | Pass | Found the Reference with source type `codex` |
| Open Loop completion | Pass | Accepted candidate moved from `open` to `done` with version 2 |
| MCP tool discovery | Pass | Listed all 11 Atlas tools over stdio |
| MCP typed capture | Pass | Reference capture returned source type `codex` |
| MCP `get_today` | Pass | Returned a valid structured response |
| Codex host exposure | Not yet verified | The current task did not expose Atlas MCP tools; test in a new task after UI installation |

## Quality evidence

- Contracts: 5 tests passed.
- `atlasd`: 20 tests passed.
- MCP: 8 tests passed.
- MCP typecheck and build passed.
- Atlas skill validation passed.
- Atlas plugin validation passed.

## Product decision

The Codex conversation is the preferred Atlas interaction surface. The Web remains the batch Review, Sources, Backup, and Settings workspace. Explicit Skill capture is available as the verified fallback while MCP host installation remains capability-gated.

Atlas does not claim automatic access to current-task context or complete Codex/ChatGPT history. The user must explicitly identify the content to retain.
