# Tracekeep Build Week Video Script

Target duration: **2:48**. All visuals use synthetic data. No music is used.
Voice: **Kokoro `af_heart`**, English (United States), generated locally with
the Apache-2.0-licensed Kokoro-82M model and MIT-licensed `kokoro-onnx` runtime.

| Time | Visual | Narration / caption |
|---|---|---|
| 0:00–0:10 | Tracekeep title card | Tracekeep is a local second brain for Codex that turns completed conversations into sourced memory and action. |
| 0:10–0:35 | Simulated Codex capture and sourced recall | Codex is the daily entry point. No “remember this” command or Tracekeep prefix is required; a meaningful completed turn is classified into sourced Learning or a reviewable proposal. |
| 0:35–1:00 | Simulated Codex “what should I continue today?” conversation | Tracekeep returns a focused list of open loops with their original sources and concrete next actions without requiring the Dashboard. |
| 1:00–1:25 | Simulated Codex resume-and-continue conversation | A prior decision, missing information, and next action are reconnected. Codex can draft the next step while Tracekeep keeps the loop reviewable and reversible. |
| 1:25–1:45 | Conversation-first local architecture card | A local Stop hook calls the authenticated loopback API; `tracekeepd` alone writes SQLite. Capture begins after installation and does not claim all history. ChatGPT Direct remains planned. |
| 1:45–2:06 | Web Review with Codex source evidence | The Dashboard is shown only as the supporting batch-review, evidence, backup, and settings workspace, not the daily entry point. |
| 2:06–2:31 | Sanitized Codex project-delivery conversation | Codex and GPT-5.6 coordinated focused subagents across requirements, UX, architecture, implementation, tests, UAT, privacy, packaging, and documentation. |
| 2:31–2:48 | Public PR and Release evidence card | Public PRs demonstrate Codex-assisted commits, review, CI, Release assets, narration, and submission preparation moving the product from decisions to a downloadable release. |

## Recording constraints

- The final file must be shorter than 3:00.
- Burn English captions into the video and include an `.srt` sidecar.
- Use the final public build and an isolated data directory.
- Do not record Restricted test content, real chats, local paths, tokens, or
  private repositories.
- Label the opening conversation as a simulated host view using synthetic data.
- Show only verified completed-turn capture, Learning, Review, lifecycle, search,
  settings, privacy, and packaging behavior.
- Do not claim automatic access to conversations created before Tracekeep was
  installed or to complete ChatGPT/Codex history.
