# P0 Closure Acceptance

## Review lifecycle

- Edit a pending candidate's type, title, and summary with `expectedVersion`.
- Merge a duplicate candidate into another candidate without deleting the source capture or evidence.
- Preserve the merge target and expose it in review history.
- Undo accepted, rejected, or merged decisions without hard-deleting business records.
- Keep rejected and merged candidates out of ordinary search results.
- Show pending and recent review history in the Web with explicit confirmation and conflict handling.

## Backup restore

- List valid local SQLite backups without exposing arbitrary filesystem paths.
- Validate `quick_check` before offering a backup for restore.
- Refuse restore while `tracekeepd` is listening; never hot-swap an open SQLite database.
- Create a pre-restore backup and checkpoint the stopped database before replacement.
- Accept only a backup basename resolved inside the configured backup directory.
- Require an explicit confirmation token or flag and provide rollback on replacement failure.
- Verify integrity after restart. The Web may guide the operator, but must not claim a queued request is a completed restore.

## Source import UI

- Import ChatGPT JSON exports through the existing bounded backend endpoint; ZIP streaming remains a later capability.
- Import a Daily Log with date, content, optional source path, and sensitivity.
- Treat imported content as untrusted data and create Review candidates only.
- Show payload-size and validation failures without logging or rendering raw restricted content.
- Do not add fake sync progress or imply that Codex history is available.

## Gate evidence

- Contract, storage, API, and Web tests cover the new paths.
- A real browser flow covers edit, merge, undo, and both imports.
- A temporary clean-room database proves backup, stopped-service restore, and post-restore integrity.
- Restricted canary and zero-paid-provider tests remain green.
