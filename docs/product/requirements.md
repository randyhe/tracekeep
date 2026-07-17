# Atlas V1 Requirements Baseline

## Core promise

Atlas helps a user remember what mattered and resume what was interrupted, directly from the conversations they already use.

## P0 requirements

| ID | Requirement | Acceptance summary |
|---|---|---|
| CONV-01 | Conversation-first entry | From a Codex conversation, explicitly capture an Open Loop, Decision, or Reference with source `codex`; normal use does not require opening the Web dashboard. |
| RECALL-01 | Interrupted-work recall | From a Codex conversation, retrieve unfinished items, today's focus, or sourced search results from Atlas rather than model memory. |
| CAP-01 | Quick capture | Save confirmed text without AI and return a sourced candidate within 2 seconds p95. |
| LOOP-01 | Open-loop lifecycle | Support open, waiting, scheduled, done, and dismissed with optimistic concurrency. |
| TODAY-01 | Daily focus | Return at most three ranked actionable open loops using deterministic local rules. |
| REVIEW-01 | Candidate review | Accept, edit, reject, and undo; Alpha auto-accepts nothing. |
| SEARCH-01 | Local search | FTS5 search returns evidence-linked results without an AI provider. |
| SOURCE-01 | Source transparency | Report full, partial, reference-only, unavailable, or export-backfilled coverage. |
| IMPORT-01 | Source import | Manual, ChatGPT export, and Daily Log imports are idempotent and treat content as untrusted. |
| PRIV-01 | Privacy | Restricted or work-only source text never appears in logs or sanitized exports. |
| COST-01 | Zero incremental billing | No Platform API key or paid provider can be configured in V1. |
| REL-01 | Recovery | Online SQLite backup restores the complete runtime state. |

## Non-goals

- Complete ChatGPT history access
- External writes to mail, calendar, ADO, or GitHub
- Cloud hosting, multi-user tenancy, billing, vectors, knowledge graphs, or native apps
