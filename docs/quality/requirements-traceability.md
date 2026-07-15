# Atlas V1 Requirements Traceability Matrix

Status values: `Planned`, `Implemented`, `Verified`, `Blocked`.

| ID | Requirement | Primary evidence | Automated evidence | Status |
|---|---|---|---|---|
| CAP-01 | Save user-confirmed text as review-first candidates | `POST /api/v1/captures` | API tests and real browser flow | Verified |
| LOOP-01 | Manage open, waiting, scheduled, done, dismissed states | Open-loop API and audit event | version-conflict tests; browser state action | Implemented |
| TODAY-01 | Show at most three focus items | `GET /api/v1/today` | storage limit and real browser flow | Verified |
| REVIEW-01 | Accept, edit, reject, merge, and undo candidates | Review action API | accept/reject browser flow; edit/undo API | Blocked: merge and full Web lifecycle remain |
| SEARCH-01 | Local FTS5 retrieval with source evidence | `GET /api/v1/search` | API test and real browser result | Implemented |
| SOURCE-01 | Report source capability, checkpoint, and completeness | Source API | real browser source rendering pending | Implemented |
| IMPORT-01 | Import Manual, ChatGPT Export, and Daily Log safely | import endpoints | native export integration test | Implemented |
| PRIV-01 | Keep restricted text out of logs, ordinary search, and sanitized exports | sensitivity policy | restricted canary and storage tests | Verified |
| COST-01 | Make no paid API, transcription, hosting, or provider calls | cost status and config | browser cost display; process network audit pending | Implemented |
| REL-01 | Provide idempotency, optimistic concurrency, backup, restore, and forward migrations | storage/API | concurrency and online-backup reopen tests | Implemented; operator restore workflow pending |
| MCP-01 | Provide a thin local MCP adapter with text fallback | Atlas plugin | manifest, skill, MCP smoke tests | Implemented |
| HIST-01 | Do not claim full ChatGPT/Codex history access unless a stable capability passes | capability matrix | copy/config review | Verified |

The Gate report must link concrete test output before changing any row to `Verified`.
