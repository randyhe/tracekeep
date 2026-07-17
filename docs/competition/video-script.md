# Atlas Build Week Video Script

Target duration: **2:48**. All visuals use synthetic data. No music is used.
Voice: **Microsoft Zira Desktop**, English (United States), local Windows TTS.

| Time | Visual | Narration / caption |
|---|---|---|
| 0:00–0:14 | Atlas title card | Important work often disappears inside chats. A task is mentioned, a decision is made, or someone promises to follow up — then the conversation moves on. Atlas is built to recover those unfinished loops. |
| 0:14–0:30 | Today page | Atlas is a local-first memory and action system. The complete product runs as a Windows Web app on loopback, with SQLite as the source of truth and no paid API, cloud host, or external service budget. |
| 0:30–0:52 | Sources → import synthetic ChatGPT JSON | Here I deliberately import one synthetic ChatGPT conversation. Atlas reads only the user-authored message, ignores the assistant suggestion, and extracts an action, a waiting item, and a decision. It never claims automatic access to all chat history. |
| 0:52–1:14 | Review queue | Nothing silently becomes a task. Every candidate stops in Review, where I can inspect its source, edit it, accept it, reject it, or undo the decision. This review-first boundary keeps the user — not the extractor — in control. |
| 1:14–1:36 | Possible duplicate → Merge → evidence | The checksum task already exists from another source, so Atlas marks a possible duplicate. I merge the new evidence into the existing open loop. Both sources remain inspectable, and undo removes only the new evidence link instead of deleting information. |
| 1:36–1:58 | Today → evidence → Next week → Undo | Today highlights at most three priorities. I can open the evidence, move an item to Waiting or Next week, mark it done, and immediately undo a change. These are reversible state transitions, not hidden automation. |
| 1:58–2:18 | Search `local-first` → source detail | Search stays local with SQLite FTS5. A result shows the human-readable conversation title and source type, so the user can return to the evidence instead of trusting an unsupported summary. |
| 2:18–2:34 | Settings → cost protection | Privacy is product behavior, not a slogan. Restricted imports stay out of ordinary search and sanitized export. The competition configuration shows a zero-dollar external budget, with platform APIs and paid providers disabled. |
| 2:34–2:48 | Architecture and release card | Codex and GPT-5.6 helped turn the product decisions into implementation, testing, privacy checks, and a judge-ready Windows release. Atlas does not try to remember everything. It makes sure the important things you already said can still become action. |

## Recording constraints

- The final file must be shorter than 3:00.
- Burn English captions into the video and include an `.srt` sidecar.
- Use the final public build and an isolated data directory.
- Do not record Restricted test content, real chats, local paths, tokens, or
  private repositories.
- Do not show Codex MCP as installed. Label it Experimental because the protocol
  passed but the current host did not expose Atlas tools.
