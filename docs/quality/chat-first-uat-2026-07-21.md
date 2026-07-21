# Chat-First Automatic Capture UAT

- Date: 2026-07-21
- Owner: Product owner
- Build: Atlas v0.3.0
- Result: **Passed**

## Scenario

The product owner shared an everyday learning insight in a normal Codex
conversation without asking Atlas to save it. After that completed turn, the
owner opened a separate Codex task and asked Atlas to recall the method and
show its source.

## Acceptance evidence

| Criterion | Result |
|---|---|
| No explicit "remember this" or manual Capture action was used | Passed |
| The trusted Stop hook preserved the meaningful completed turn | Passed |
| A separate Codex task retrieved the learning note through Atlas | Passed |
| The answer summarized the remembered method accurately | Passed |
| The result included Codex source type, source title, locator, and timestamp | Passed |
| Review Candidate and accepted Reference resolved to one sourced result | Passed |

## Product-owner decision

The conversation-first `record -> find -> resume` path is accepted for the
v0.3.0 local release. This UAT validates one real end-to-end product journey;
it does not claim completion of UAT-017's larger blind sample, a 14-day Alpha,
retention metrics, or unrestricted ChatGPT/Codex history access.
