# Build Week Demo Video Validation

Validation date: **2026-07-21**

## Final local artifact

- Filename: `tracekeep-build-week-conversation-first-af-heart.mp4`
- Duration: `00:02:48.36`
- Resolution: `1920x1080`
- Video: H.264 High, 25 fps, yuv420p
- Audio: AAC LC, mono, Kokoro `af_heart` narration generated locally
- Captions: 27 English cues burned into the video; `.srt` sidecar retained
- Size: 7,410,061 bytes
- SHA-256: `4BAFE968447B8741934BF2DA0DD0392522527B358E9443405E9EC3E4B68940A7`

The narration uses the Apache-2.0-licensed Kokoro-82M model through the
MIT-licensed `kokoro-onnx` runtime. The final volume scan reported a `-0.3 dB`
peak with no clipping.

The MP4 is intentionally excluded from Git. After product-owner review, the
same validated artifact was published publicly at
https://youtu.be/6vihaJ5nwW8.

## Recording boundary

- The recording used an isolated Tracekeep data directory and an automatically
  selected loopback port.
- All displayed content is synthetic.
- The recording is conversation-first: three clearly labeled simulated Codex
  views use synthetic data to demonstrate automatic meaningful-turn capture,
  sourced priorities, and resuming an open loop. A local architecture card
  explains the Stop hook, loopback API, `tracekeepd`, SQLite, and ChatGPT Direct
  boundary. The Web appears only for batch Review and evidence.
- A sanitized Codex delivery summary and public PR evidence card describe the
  real project workflow without displaying private tasks, paths, or content.
- No real conversation, Restricted text, private repository, token, or user
  filesystem path is displayed.
- The recording does not claim automatic access to the full current
  conversation or complete ChatGPT/Codex history.

## Mechanical checks

- MP4 duration is below the competition's three-minute limit.
- A video stream and an audio stream are present.
- Eight post-encode frames were visually checked across every scene.
- Earlier dashboard-heavy encodes were rejected because they misrepresented the
  conversation-first product entry point. The final encode allocates about 100
  seconds to Codex use and Codex delivery, and about 20 seconds to the Web.
- Silence detection confirmed a 2.03-second opening buffer and no inter-scene
  silent interval longer than 3.44 seconds.
- The public YouTube page resolves to the expected title, plays the 2:48 video,
  and reports the published artifact with no copyright issues.
- Regeneration from public `main` commit `3e69bdd3855a41a44fac374d232a1b2545a8f3c7`
  completed successfully on Windows using the repository recording and encoding
  scripts.
