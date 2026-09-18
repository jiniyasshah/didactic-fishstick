# Verification

The editor was checked in the Codex browser on September 18, 2026.

- Direct canvas text editing updates the transcript and timeline.
- Highlighting an individual word and toggling italic leaves other words unchanged.
- Shift-click selects multiple caption clips.
- Caption splitting, timestamp shifting, SRT round-trip, and invalid-project rejection passed model checks.
- A generated two-second WAV decodes and produces 500 nonempty waveform bins.
- Transcription preparation produces 16 kHz mono WAV.
- Separation preparation produces stereo AAC audio, including the portable encoder fallback.
- A 1080p MP4 export includes both video and audio and can be decoded again as input.
- A 4K/60 FPS captioned MP4 export succeeds.

Live Replicate separation and OpenAI transcription were not run because provider credentials were not supplied. Both integrations have real request, polling, cancellation, and error paths; the editor does not simulate AI results.

The original Gill Sans MT font is not redistributed. The editor uses a locally installed font, or accepts font files for the current session. It identifies a missing regular font and uses the same fallback in preview and export.

Exports use H.264 and AAC. Device codec support, available memory, and source format affect large exports. Import is limited to 1 GB and twelve minutes. AAC encoding may add a small final audio packet at the end of the file.
