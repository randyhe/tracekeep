# Atlas

Atlas is a local-first personal memory and action system focused on finding and advancing open loops from conversations.

## V1 guarantees

- Local capture, review, open-loop tracking, and FTS search work without an AI API key.
- SQLite is the runtime source of truth.
- Git exports are sanitized and intentionally incomplete for restricted data.
- Codex integration is an optional convenience layer and never a dependency for local data access.
- Atlas does not create usage-based API charges.

## Local entry points

- Web: `http://127.0.0.1:4310` after a production build and start
- Codex: optional `plugins/atlas` plugin backed by a local MCP adapter; host installation remains capability-gated

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
