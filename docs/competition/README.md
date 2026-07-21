# Competition evidence and claim boundaries

Tracekeep is submitted to OpenAI Build Week under **Apps for Your Life**. This directory contains dated capability probes, synthetic evaluation evidence, readiness reports, submission material, and video scripts.

## Repeatable evidence

- [Competition harness](../../tests/competition/README.md)
- [Initial capability probe](capability-probe-2026-07-15.md)
- [Conversation-first probe](conversation-first-probe-2026-07-17.md)
- [Competition readiness report](readiness-2026-07-16.md)
- [Submission checklist](submission-checklist.md)

The visible 30-sample Development set reports Open Loop TP 18 / FP 0 / FN 0 and Decision TP 6 / FP 0 / FN 0. After rule freeze, QA generated and ran a separate 50-sample Holdout once; it reports Open Loop TP 35 / FP 0 / FN 0, with a Wilson 95% precision/recall interval of 90.11%–100%.

These are deterministic synthetic test results. They do not prove real-user retention, a completed 14-day Alpha, or that local rules are equivalent to general model reasoning. Competition readiness is separate from Gate 6, which remains a real-user gate.

## Verified integration boundary

The dated conversation-first probe verified 11 MCP tools and a typed `codex` capture against an isolated non-production database. MCP availability still depends on the Codex host. When MCP is unavailable, the installed skill uses the loopback HTTP fallback.

Tracekeep does not claim automatic access to all ChatGPT or Codex history. ChatGPT Export is a manual backfill path.

## Public claims

Allowed claims include:

- Tracekeep passed dated synthetic Golden Journey replays.
- A user can review conversation-first captures, resume open loops, and search sourced evidence.
- Tracekeep processes made no non-loopback request during the documented observed test flows.
- Codex and GPT-5.6 assisted implementation, testing, review, and packaging.

Do not claim:

- a completed 14-day real-user Alpha;
- proven retention or recovery of real forgotten work;
- access to all ChatGPT or Codex history;
- absolute zero cost in every environment;
- absolute absence of all machine or browser network activity;
- direct ChatGPT mobile capture before the planned authenticated gateway ships.
