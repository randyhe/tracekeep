# Codex and Atlas MCP Probe — 2026-07-16

## Result

| Layer | Result | Evidence |
|---|---|---|
| Local Atlas Web | Passed | Existing service returned `ready`, SQLite integrity `ok`, schema v2 |
| Atlas skill fallback | Passed | The installed skill reached `http://127.0.0.1:4310/today` |
| MCP protocol | Passed | Stdio client listed all 11 tools against an isolated Atlas instance |
| MCP `capture` | Passed | One synthetic Review Candidate was created in isolated data |
| MCP `get_today` | Passed | The tool call returned successfully from the isolated instance |
| Current Codex host exposure | Not available | No Atlas-named tool was exposed to this task session |
| Packaged Codex CLI probe | Blocked | Windows denied shell execution of the packaged `codex.exe` |
| ChatGPT/Codex history | Not available | No supported complete-history reader was exposed |

## Product decision

Atlas MCP remains **Experimental** for this release. The implementation and
protocol work, but the current host installation has not been reproduced. The
complete and supported entry point remains the local Web dashboard, with the
installed Atlas skill providing direct links and a local HTTP fallback.

The repository marketplace at `.agents/plugins/marketplace.json` prepares the
plugin for installation. A restart and new Codex task are required before a
human can complete the host-level acceptance check.

## Boundaries

- The probe used synthetic data under `work/competition-runs`; it did not write
  the normal Atlas database.
- Atlas does not claim access to all ChatGPT or Codex history.
- Apps SDK cards were not exposed and are not part of the release claim.
- No paid API, hosted Atlas service, or external write integration was enabled.

Official Codex guidance treats MCP as the extension surface for local tools and
repo marketplaces as the distribution path for local plugins. Host availability
still depends on installation, restart, product surface, and workspace policy.
