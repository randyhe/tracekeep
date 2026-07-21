# Tracekeep Competition QA Harness

This harness provides reproducible, synthetic competition evidence. It does not replace Gate 6 or a real 14-day user alpha.

## Safety boundary

- Every server run sets `TRACEKEEP_DATA_DIR` to an absolute child of `work/competition-runs/<run-id>`.
- Every server run uses an available port from `4311-4399` and binds through the production entry point to `127.0.0.1`.
- The harness refuses paths outside the competition run root.
- It never reads or writes `%LOCALAPPDATA%\Tracekeep`.
- SQLite, WAL, and SHM files are local test state and are excluded from publishable-artifact scans.
- Imported commands and URLs remain inert strings. The harness never executes or opens them.

## Prerequisite

Build the application before running the harness:

```powershell
pnpm build
```

## Development extraction evaluation

The 30-sample development fixture is visible to developers and must never be described as a holdout:

```powershell
node scripts/competition/evaluate-extractor.mjs
```

To save a report, the output path must remain under `work/competition-runs`:

```powershell
node scripts/competition/evaluate-extractor.mjs tests/competition/fixtures/development.json work/competition-runs/dev-eval/reports/extractor.json
```

The report includes TP, FP, FN, precision, recall, F1, macro-F1, and Wilson 95% confidence intervals. A separate QA owner must generate and freeze the 50-sample holdout only after rules are frozen. If rules change after a holdout run, discard that holdout and generate a new version.

## Golden journeys

```powershell
node scripts/competition/golden-journeys.mjs local-gate-001
```

The API harness validates:

1. Conversation import to multiple review candidates, evidence, scheduling, and completion.
2. Dynamic duplicate hint, merge, dual evidence, and undo.
3. Restricted malicious text remaining inert and absent from ordinary search, sanitized export, and API responses.

It also observes TCP connections owned by the `tracekeepd` PID on Windows. A passing report supports only this statement:

> No external requests were observed from Tracekeep processes during tested runtime flows.

It does not make a whole-machine or browser network claim.

## Canary scan

The scanner accepts a runtime-generated high-entropy canary and scans publishable text artifacts under competition run folders plus the tracked Git diff:

```powershell
node scripts/competition/canary-scan.mjs <runtime-canary> work/competition-runs/<run-id>/reports
```

Do not place a real restricted string in source code, fixtures, screenshots, reports, or command history. Competition run directories and databases must never be included in the public repository or release package.
