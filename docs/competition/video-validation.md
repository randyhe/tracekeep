# Build Week Demo Video Validation

Validation date: **2026-07-21**

## Final local artifact

- Filename: `tracekeep-build-week-final.mp4`
- Duration: `00:02:47.72`
- Resolution: `1920x1080`
- Video: H.264 High, 25 fps, yuv420p
- Audio: AAC LC, mono, Microsoft Zira Desktop narration
- Captions: 16 English cues burned into the video; `.srt` sidecar retained
- Size: 6,570,237 bytes
- SHA-256: `FC10E4CD41B3C6D066AB3168011A6C4B7BE462B5FD37442C0781107AF1E2FB46`

The MP4 is intentionally excluded from Git. The public YouTube URL will be
added only after the product owner reviews the local artifact and publishes it.

## Recording boundary

- The recording used an isolated Tracekeep data directory and an automatically
  selected loopback port.
- All displayed content is synthetic.
- The opening is a clearly labeled simulated Codex conversation using synthetic
  data. The recording then demonstrates a real local `codex` capture and source,
  Review, possible-duplicate merge, two-source Evidence, reversible Today state,
  FTS5 search, and cost controls.
- No real conversation, Restricted text, private repository, token, or user
  filesystem path is displayed.
- The recording does not claim automatic access to the full current
  conversation or complete ChatGPT/Codex history.

## Mechanical checks

- MP4 duration is below the competition's three-minute limit.
- A video stream and an audio stream are present.
- Three post-encode frames were visually checked at the conversation, Codex
  source, and architecture scenes.
- The first encode was rejected because its captions obscured product controls.
  The final encode uses 16 shorter cues and a reduced caption size.
- Final public-link verification remains pending until YouTube publication.
- Regeneration from public `main` commit `efb62a6e89c06a02d4464f06143052ee4cfdf059`
  completed successfully on Windows using the repository recording and encoding
  scripts.
