# Build Week Demo Video Validation

Validation date: **2026-07-21**

## Final local artifact

- Filename: `tracekeep-build-week-final-af-heart.mp4`
- Duration: `00:02:48.96`
- Resolution: `1920x1080`
- Video: H.264 High, 25 fps, yuv420p
- Audio: AAC LC, mono, Kokoro `af_heart` narration generated locally
- Captions: 16 English cues burned into the video; `.srt` sidecar retained
- Size: 6,849,165 bytes
- SHA-256: `53DD212AD38FFA44F462CABBE5987B44F791950F7D72471BDAA64E6F84D6FA11`

The narration uses the Apache-2.0-licensed Kokoro-82M model through the
MIT-licensed `kokoro-onnx` runtime. The final volume scan reported a `-0.4 dB`
peak with no clipping.

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
