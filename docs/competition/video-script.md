# Atlas Build Week Video Script

Target duration: **2:36**. All visuals use synthetic data. No music is used.
Voice: **Microsoft Zira Desktop**, English (United States), local Windows TTS.

| Time | Visual | Narration / caption |
|---|---|---|
| 0:00–0:12 | Atlas title card | Important work often disappears inside chats. Atlas recovers the unfinished loops behind everyday ideas, decisions, and follow-ups. |
| 0:12–0:36 | Clearly labeled simulated Codex conversation | Atlas starts where the thought happens: in the conversation. Say what to remember, then ask what unfinished work is worth resuming. This screen uses synthetic data and does not claim automatic access to every chat. |
| 0:36–0:56 | Actual Review candidate with Codex source → Accept | The capture is now a real local Atlas record with its Codex source attached. It waits in Review, where the user can inspect it before accepting it. The Dashboard is the control room, not the required daily entry point. |
| 0:56–1:18 | Possible duplicate → Merge → evidence | The same follow-up can appear in more than one place. Atlas marks a possible duplicate, merges only when asked, and keeps both pieces of evidence inspectable. Undo removes the added evidence link without deleting the original work. |
| 1:18–1:40 | Today → evidence → Next week → Undo | Today highlights at most three priorities. An item can move to Waiting, Next week, Done, or back to Today, and the latest change can be undone immediately. |
| 1:40–2:00 | Search `local-first` → source detail | Local SQLite FTS5 search returns the record together with its human-readable source. Atlas helps the user return to evidence instead of trusting an unsupported memory. |
| 2:00–2:18 | Settings → cost protection | Restricted content stays out of ordinary search and sanitized export. The competition build keeps a zero-dollar external budget, with paid providers and platform APIs disabled. |
| 2:18–2:36 | Architecture and release card | Codex and GPT-5.6 turned product decisions into implementation, tests, privacy checks, and a judge-ready Windows release. Atlas remembers where you stopped, what comes next, and why it was worth continuing. |

## Recording constraints

- The final file must be shorter than 3:00.
- Burn English captions into the video and include an `.srt` sidecar.
- Use the final public build and an isolated data directory.
- Do not record Restricted test content, real chats, local paths, tokens, or
  private repositories.
- Label the opening conversation as a simulated host view using synthetic data.
- Show only verified local capture, Review, lifecycle, search, privacy, and packaging behavior.
- Do not claim automatic access to the full current conversation or complete history.
