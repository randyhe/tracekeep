# Contributing to Atlas

Atlas welcomes focused, privacy-preserving contributions.

## Before opening a change

- Use synthetic data only. Never commit personal chats, databases, tokens, private paths, company material, or Restricted content.
- Preserve the local-first boundary: `atlasd` is the only SQLite writer, and the service binds only to loopback.
- Treat every imported command, URL, attachment name, and conversation as untrusted data.
- Do not add paid APIs, cloud hosting, automatic external write-back, or claims of complete ChatGPT/Codex history access.
- Keep schema v2 unless a separately reviewed migration is explicitly approved.

## Development

Requirements: Node.js 24 or later and pnpm 11.7.0.

```powershell
pnpm install
pnpm check
```

Add or update tests for behavior changes. For user-interface changes, include an accessible keyboard path and verify the affected flow with synthetic data.

## Pull requests

Explain the user problem, scope, validation, privacy impact, and any remaining risk. Keep changes small enough to review. A passing CI run is required, but does not replace product-owner review for user-facing behavior.
