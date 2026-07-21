# Codex and MCP Capability Probe

Date: 2026-07-15 CDT

## Result

| Capability | Result | Evidence | Competition behavior |
| --- | --- | --- | --- |
| Local Web on loopback | Pass | The production build served an isolated schema v2 database on `127.0.0.1:4312`; the Capture, Review, Today, merge, undo, and privacy flows were exercised in a real browser. | Web remains the complete entry point. |
| Tracekeep Codex skill definition | Pass with fallback | The installed skill contains a bounded local health/start workflow and direct links to Today, Capture, Search, and Review. | The skill can open the Web entry point when the local service is available. |
| Tracekeep MCP server build and loopback guard | Pass | Workspace build, typecheck, and tests pass. `TRACEKEEP_BASE_URL` rejects non-loopback hosts and HTTPS. | MCP remains safe to test locally. |
| MCP tools exposed by this Codex host | Not available | No Tracekeep MCP tools were exposed to this task session, so host calls to `capture` and `get_today` could not be reproduced. | Mark MCP as **Experimental** and use the Web/text fallback in the demo. |
| Codex or ChatGPT history access | Not available | No supported history-reading capability was exposed. | Do not claim automatic or complete history access. Use Manual, Daily Log, or ChatGPT Export import. |
| Apps SDK card UI | Not tested | No Tracekeep Apps SDK surface was exposed. | Use text fallback; card UI is not part of the competition claim. |

## Browser and network observation

The isolated run used `work/competition-runs/e2e-20260715-2324` and port 4312. During the tested flows, the Tracekeep process had no observed non-loopback TCP connection. Browser requests recorded by the test session all targeted `http://127.0.0.1:4312`.

This evidence supports only the following statement:

> No external requests were observed from Tracekeep processes during tested runtime flows.

It does not claim that the entire machine or browser had no network activity.
