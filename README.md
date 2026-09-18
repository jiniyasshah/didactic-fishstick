# Verse — Caption & Lyric Studio

A canvas and timeline editor for video captions and song lyrics. Built with React, Vinext and Mediabunny.

## Run locally

Use Node.js 22.13 or newer. Install dependencies with `npm ci`, then run `npm run dev`. The local preview opens at http://localhost:5173.

`npm run build` produces a Cloudflare-compatible Worker in `dist/server` and browser assets in `dist/client`. `.openai/hosting.json` identifies the existing private Site; reuse it when publishing.

## Editing

- Import a video or audio clip, up to twelve minutes and 1 GB.
- Generate captions through the AI workflow, import SRT/VTT subtitles, or add captions manually.
- Double-click text on the canvas to edit. Highlight words to change only their size, color, bold or italic formatting.
- Drag captions and their scale handles. Shift/Ctrl/Cmd-click clips to select multiple captions.
- Move and trim timeline clips, split at the playhead, duplicate, merge, delete, copy formatting, or undo/redo.
- Save a `.verse.json` project from the project menu. Media is not embedded: relink the original file when reopening. Download SRT captions from the same menu.

## AI connections

Open **Generate captions** or **AI connections** from the project menu. Add a Replicate API key for Demucs separation and an OpenAI API key for Whisper transcription. Keys are kept only in page memory and sent to the same-origin processing route. They are not saved into projects or browser storage.

The workflow sends the selected audio to the named providers and uses their normal paid APIs. It separates stereo vocals and instrumental audio, prefers the isolated vocals for word-timed transcription, and leaves every result editable. Cancellation stops a running separation job where the provider permits it. Low-confidence transcription segments are marked for review.

## Typography and export

Gill Sans MT is the default family. Its proprietary font files are not bundled. Installed fonts are used automatically; **Load Gill Sans font files** accepts regular, bold, italic and bold italic files for the current session. A missing font falls back visibly.

Preview and MP4 export share the same caption renderer. Exports support 1080p/4K and 30/60 FPS, H.264 video, and 256 kbps AAC audio. A bundled portable AAC encoder supports browsers without native encoding. Device video-codec support and available memory can limit large exports. Exported files remain local.

## Verification

Run `node --test tests/editor.test.mjs` and `node node_modules/typescript/bin/tsc --noEmit`. See VERIFICATION.md for browser checks and remaining external-service validation.
