# Atlas — Devpost Submission Draft

## Project name

Atlas — Local-First AI Memory & Action System

## Tagline

Turn unfinished thoughts from chats and daily notes into sourced, reviewable
actions that do not disappear.

## Category

Apps for Your Life

## Inspiration

Many people use AI to think, search, plan, and start projects, but the useful
follow-ups remain scattered across conversations. The problem is not capturing
more information. It is recovering the promises, decisions, and waiting items
that were mentioned but never closed.

## What it does

Atlas is a conversation-first, local-first personal memory and action system.
In Codex, the user can explicitly say what should be remembered and later ask
what unfinished work is worth resuming. Atlas can also import deliberate
ChatGPT exports, daily logs, or manual captures. Every extracted open loop or
decision goes to Review before it can affect the user's action list.

The user can edit, accept, reject, merge, schedule, complete, dismiss, or undo.
Every accepted item retains inspectable source evidence. Atlas can detect a
possible duplicate across sources, merge the new evidence into the existing
item, and undo only that evidence link without deleting either source.

Today intentionally highlights no more than three items. SQLite FTS5 provides
fast local search with human-readable source attribution. Restricted imports
remain inert data and are excluded from ordinary search, sanitized export,
logs, screenshots, and competition artifacts.

## How we built it

Atlas uses a TypeScript monorepo with Fastify, React, Vite, Zod, SQLite,
better-sqlite3, Vitest, Playwright, and a local MCP adapter. `atlasd` is the only
SQLite writer. Writes use idempotency keys, updates use optimistic concurrency,
and deletion is soft. Business tables remain authoritative while audit and
outbox tables support undo, export, and background work without introducing
full event sourcing.

Codex and GPT-5.6 were used as the collaborative engineering environment for
product review, architecture tradeoffs, implementation, regression testing,
privacy analysis, UAT playback, packaging, and release verification. The human
owner made the product, privacy, cost, and release decisions. The required
`/feedback` Session ID will identify the core build thread.

## Challenges

- Preserving source evidence while making merge and undo genuinely reversible.
- Treating imported instructions as inert text instead of executable commands.
- Keeping Restricted content out of search, logs, screenshots, and releases.
- Packaging native SQLite dependencies with a matching Node runtime on Windows.
- Separating a reproducible competition gate from an uncompleted 14-day Alpha.
- Avoiding unsupported claims about complete ChatGPT or Codex history access.

## Accomplishments

- 74 automated TypeScript, unit, and integration checks pass.
- Three isolated Golden Journeys pass.
- A frozen 50-sample Holdout passed the required extraction thresholds; the
  Holdout remains private to prevent evaluation tuning.
- The Windows package starts with bundled Node, binds only to `127.0.0.1`, and
  leaves the normal Atlas database unchanged.
- Package scans found zero prohibited artifacts and zero prohibited content.
- During tested Atlas flows, no non-loopback connection from the Atlas process
  was observed.

## What we learned

A useful second brain needs a trust loop more than it needs autonomous agents.
Review, source visibility, undo, and honest capability boundaries are the
features that make extracted suggestions safe enough to use every day.

## What's next

After the competition, Atlas will complete the real 14-day Alpha, improve
candidate usefulness from user feedback, and retest the optional Codex plugin
after installation. ChatGPT Direct mobile through a secure remote MCP gateway,
weekly review, and sourced AI answers remain later capabilities. Paid providers,
cloud hosting, complete
history access, email/calendar write-back, and autonomous execution are not V1
claims.

## Public links

- Repository: https://github.com/randyhe/atlas
- Windows release: https://github.com/randyhe/atlas/releases/latest
- Video: `TBD — public YouTube URL`
- `/feedback` Session ID: `TBD — account-owned final action`

## Judge testing instructions

1. Download the ZIP and `.sha256` file from the public release.
2. Verify the checksum, extract the ZIP, and double-click `Start Atlas.cmd`.
3. No administrator account, Node.js, pnpm, rebuild, API key, or test account is
   required.
4. Follow the three suggested journeys in `README-TESTING.md`.
5. Atlas uses synthetic demo data and never reads the normal
   `%LOCALAPPDATA%\Atlas` database.

## Required disclosure

Atlas existed as a local Alpha before the Submission Period. The public Git
history documents the meaningful post-2026-07-13 extension: review and restore
closure, bilingual multi-candidate extraction, sourced search, reversible task
states, privacy and network harnesses, Windows packaging, plugin distribution,
and competition release evidence.
