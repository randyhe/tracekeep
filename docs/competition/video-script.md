# Tracekeep Build Week Video Script

Target duration: **2:42**. All visuals use synthetic data. No music is used.
Voice: **Microsoft Zira Desktop**, English (United States), local Windows TTS.

| Time | Visual | Narration / caption |
|---|---|---|
| 0:00–0:14 | Tracekeep title card | Life interrupts. Valuable learning, half-finished plans, and sudden ideas disappear inside the next conversation. Tracekeep turns them into a second brain. |
| 0:14–0:42 | Real Codex conversation with synthetic daily-life paper and family-study example | The user talks naturally. No “remember this” command is required. When this meaningful turn ends, the trusted local Tracekeep hook extracts what is worth keeping. It does not scan every historical chat. |
| 0:42–1:05 | Learning page: conversation note + paper note + visible source | The conclusion and the paper become local Learning Notes automatically, each connected to its source. Tracekeep can later find what was learned and why it mattered. |
| 1:05–1:27 | Review page: proposed weekly routine → Accept | A proposed next action is different from a learning note. It waits in Review, where the user can edit, accept, merge, reject, or undo it before it affects Today. |
| 1:27–1:48 | Today → Next week → Undo | Today highlights at most three priorities. Interrupted work can move to Waiting, Next week, Done, or back to Today, and the latest change can be undone. |
| 1:48–2:07 | Search paper topic → sourced result | Local SQLite FTS5 search reconnects the user to the earlier conclusion and its evidence instead of relying on unsupported model memory. |
| 2:07–2:25 | Settings: automatic capture On → Off → On, cost protection | Automatic capture is user-controlled. Short social exchanges and credential-like text are skipped, while paid providers and platform APIs remain disabled. |
| 2:25–2:42 | Local architecture and Windows release card | Tracekeep runs on loopback with local authentication and SQLite. Codex and GPT-5.6 helped turn the product decisions into tests and a portable Windows release. |

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
