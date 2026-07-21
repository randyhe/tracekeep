# Tracekeep — Devpost Submission Draft

## Project name

Tracekeep — Local-First AI Memory & Action System

## Tagline

Let meaningful conversations become sourced learning and unfinished work that
does not disappear.

## Category

Apps for Your Life

## Inspiration

Many people use AI to think, search, plan, and start projects, but the useful
follow-ups remain scattered across conversations. The problem is not capturing
more information. It is recovering the promises, decisions, and waiting items
that were mentioned but never closed.

## What it does

Tracekeep is a conversation-first, local-first second brain. When a meaningful
Codex turn ends, a trusted local hook preserves the useful result without
requiring the user to say a magic phrase. Conclusions become sourced Learning
Notes. Documents, papers, and web pages remain connected to their origin.
Proposed actions and decisions go to Review before they can affect the user's
action list. Explicit capture and ChatGPT Export remain available for urgent
items and historical backfill.

The user can edit, accept, reject, merge, schedule, complete, dismiss, or undo.
Every accepted item retains inspectable source evidence. Tracekeep can detect a
possible duplicate across sources, merge the new evidence into the existing
item, and undo only that evidence link without deleting either source.

Today intentionally highlights no more than three items. SQLite FTS5 provides
fast local search with human-readable source attribution. Restricted imports
remain inert data and are excluded from ordinary search, sanitized export,
logs, screenshots, and competition artifacts.

## How we built it

Tracekeep uses a TypeScript monorepo with Fastify, React, Vite, Zod, SQLite,
better-sqlite3, Vitest, Playwright, and a local MCP adapter. `tracekeepd` is the only
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

- All repository typechecks, automated tests, and production builds pass; the
  v0.4.0 release validation records 96 automated tests.
- An authenticated Windows Stop-hook probe produced sourced paper and
  conversation notes plus a reviewable next action, and idempotent replay
  produced no duplicates.
- Three isolated Golden Journeys pass.
- A frozen 50-sample Holdout passed the required extraction thresholds; the
  Holdout remains private to prevent evaluation tuning.
- The Windows package starts with bundled Node, binds only to `127.0.0.1`, and
  leaves the normal Tracekeep database unchanged.
- Package scans found zero prohibited artifacts and zero prohibited content.
- During tested Tracekeep flows, no non-loopback connection from the Tracekeep process
  was observed.

## What we learned

A useful second brain must reduce capture effort without taking control away.
Automatic learning memory, reviewable actions, source visibility, undo, a
pause switch, and honest history boundaries make that possible.

## What's next

After the competition, Tracekeep will complete the real 14-day Alpha and improve
candidate usefulness from user feedback. ChatGPT Direct mobile through a secure remote MCP gateway,
weekly review, and sourced AI answers remain later capabilities. Paid providers,
cloud hosting, complete
history access, email/calendar write-back, and autonomous execution are not V1
claims.

## Public links

- Repository: https://github.com/randyhe/tracekeep
- Windows release: https://github.com/randyhe/tracekeep/releases/latest
- Video: `TBD — public YouTube URL`
- `/feedback` Session ID: `TBD — account-owned final action`

## Judge testing instructions

1. Download the ZIP and `.sha256` file from the public release.
2. Verify the checksum, extract the ZIP, and double-click `Start Tracekeep.cmd`.
3. No administrator account, Node.js, pnpm, rebuild, API key, or hosted account is
   required.
4. Follow the three suggested journeys in `README-TESTING.md`.
5. Tracekeep uses synthetic demo data and never reads the normal
   `%LOCALAPPDATA%\Tracekeep` database.

## Required disclosure

Tracekeep existed as a local Alpha before the Submission Period. The public Git
history documents the meaningful post-2026-07-13 extension: review and restore
closure, automatic meaningful-turn capture, sourced learning notes for papers,
documents and URLs, bilingual multi-candidate extraction, reversible task
states, privacy and network harnesses, Windows packaging, plugin distribution,
and competition release evidence.

Key dated submission-period evidence includes the initial public competition
release ([PR #1](https://github.com/randyhe/tracekeep/pull/1)), automatic
meaningful-turn capture and sourced Learning Notes
([PR #18](https://github.com/randyhe/tracekeep/pull/18)), the Tracekeep v0.4.0
Windows release ([PR #22](https://github.com/randyhe/tracekeep/pull/22)), and the
final public documentation review
([PR #27](https://github.com/randyhe/tracekeep/pull/27)).
