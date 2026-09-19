# Verification

The editor was checked in the Codex browser on September 18–19, 2026.

- Direct canvas text editing updates the transcript and timeline.
- Highlighting an individual word and toggling italic leaves other words unchanged.
- Shift-click selects multiple caption clips.
- Caption splitting, timestamp shifting, SRT round-trip, and invalid-project rejection passed model checks.
- A generated two-second WAV decodes and produces 500 nonempty waveform bins.
- Transcription preparation produces 16 kHz mono WAV.
- Separation preparation produces stereo AAC audio, including the portable encoder fallback.
- A 1080p MP4 export includes both video and audio and can be decoded again as input.
- A 4K/60 FPS captioned MP4 export succeeds.

The API-based workflow was replaced with local browser inference. The provider route and API-key inputs were removed.

- Actual Whisper Base inference recognized a Windows-generated 6.94-second speech sample, returning all 15 words and word timestamps, including “Winter is coming” and “Here we all are.” One observed run completed in 10.36 seconds. This is a short synthetic test, not a quality benchmark for singing or other languages.
- Actual HTDemucs ONNX inference returned stereo vocals and instrumental audio with 305,991 frames at 44.1 kHz, all finite samples and the original duration. A run using cached weights completed in 5.57 seconds on the test device. Both stems decoded as audio and were playable.
- The separation model was reused from the browser cache on a subsequent run.
- Canceling a running separation worker returned AbortError immediately.
- TypeScript checking, editor unit tests, and a complete production build passed after migration.

First use downloads model/runtime assets from Hugging Face/jsDelivr; media is never uploaded for inference. Large-file performance, mobile memory limits, sung-lyric accuracy, and exhaustive multilingual accuracy have not been benchmarked. Cached weights can be evicted by the browser; offline app installation is not implemented.

The original Gill Sans MT font is not redistributed. The editor uses a locally installed font, or accepts font files for the current session. It identifies a missing regular font and uses the same fallback in preview and export.

## Editing, typography, and animation checks

- Shift-selected timeline captions moved together by the same offset; dragging one end trimmed both selected ends and snapped exactly to a neighboring boundary.
- Clicking a caption sought immediately to its start. Dragging the playhead near four seconds snapped exactly to the caption boundary and selected the active caption.
- Centered text retained X/Y 50% after switching to Lora and changing between short and long sentences. Measured bounding-box left plus half its width remained 50%.
- Direct canvas resizing kept mixed font-size ratios and editable text. Selected-word Bold Italic toggled off and back on without changing other words.
- Uploaded regular and bold italic TTF files under one family and successfully exported a 12-second MP4 using that family and caption animations.
- Local MiniLM Auto Emphasis completed through the editor and enabled regeneration/removal.
- An unavailable font had identical text metrics before and after resolution.
- Mixed audio gains of 0.25 and 0.5 summed with sample error below 0.0001. An empty mix produced no audio track.
- A 1080p/30 FPS MP4 exercised all seven animation choices with mixed typography and mixed audio. Twenty-eight decoded frames were compared against the preview renderer; maximum mean grayscale pixel error was 0.0990 out of 255, including lossy H.264 encoding.
- A 4K/60 FPS animated MP4 rendered successfully.
- Sixteen automated checks cover layout, center anchors, grouping, styling preservation during text insertion, reversible emphasis, audio gains, snapping, animation endpoints, stable font fallback, project validation, and existing caption operations.
- The combined on-device workflow completed through the app: separated the sample, transcribed isolated vocals, and produced four editable captions with word times. Multiple solo tracks played together. Playback advanced the selected caption through the transcript.
- Dragging a caption from X/Y 30% to near the canvas center snapped both coordinates to exactly 50%.

Temporary browser verification pages and generated media are kept outside the published assets.

Exports use H.264 and AAC. Device codec support, available memory, and source format affect large exports. Import is limited to 1 GB and twelve minutes. AAC encoding may add a small final audio packet at the end of the file.
