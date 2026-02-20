# SnipWave — Split. Snip. Zip.

A sleek desktop application to split long audio files into multiple segments at precise positions, preview and manage each segment, and export them as a zip archive.

![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-Windows-blue)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

- **Audio Upload** — Drag-and-drop or browse for audio files (MP3, WAV, OGG, FLAC, M4A, AAC)
- **Waveform Visualization** — Visual waveform rendered on canvas for easy navigation
- **Precise Playback Controls** — Play, pause, stop, and seek with 0.1-second precision
- **Multi-Cut Marking** — Mark multiple cut positions on the timeline with visual markers
- **Segment Preview** — After splitting, preview each segment individually with play/stop controls
- **Exclude Segments** — Remove unwanted segments before zipping — excluded parts won't be in the output
- **One-Click Zip** — Download only the segments you want as a zip file
- **Keyboard Shortcuts** — Space (play/pause), Arrow keys (±0.1s seek), M (mark cut)
- **Dark Theme** — Modern, sleek dark UI with gradient branding
- **Double-Click Launch** — Open the app directly without a terminal via `Launch SnipWave.vbs`

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- npm (comes with Node.js)

### Installation

```bash
# Clone the repository
git clone https://github.com/Akash-W-Karunanayake/SnipWave.git
cd SnipWave

# Install dependencies
npm install
```

### Launch

**Option 1 — Double-click:**
Double-click `Launch SnipWave.vbs` to open the app without a terminal window.

**Option 2 — Terminal:**
```bash
npm start
```

### Build Executable

```bash
npm run build
```

The installer will be generated in the `dist/` folder.

## Usage

1. **Open the app** and drag an audio file onto the upload zone (or click to browse)
2. **Navigate the audio** using the waveform, transport controls, or keyboard shortcuts
3. **Mark cut points** by clicking "Mark Cut" or pressing `M` at the desired positions
4. **Review cut points** in the chip list below — click to jump, x to remove
5. **Click "Split"** to split the audio at all marked positions
6. **Preview segments** — click a segment to select it, use the play button to listen
7. **Exclude segments** you don't want by clicking the trash icon (restore anytime)
8. **Click "Download Zip"** to save only the included segments as a zip file

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Space` | Play / Pause |
| `←` | Seek back 0.1s |
| `→` | Seek forward 0.1s |
| `M` | Mark cut at current position |

## Tech Stack

- **Electron** v33 — Desktop application framework
- **Web Audio API** — Audio decoding, playback, and segment preview
- **Canvas API** — Waveform visualization
- **FFmpeg** (via `ffmpeg-static` + `fluent-ffmpeg`) — Audio splitting
- **Archiver** — Zip file creation
- **electron-builder** — Windows exe/installer packaging

## Dependencies

| Package | Purpose |
|---|---|
| `electron` | Desktop app framework |
| `electron-builder` | Exe packaging |
| `ffmpeg-static` | Bundled FFmpeg binary |
| `fluent-ffmpeg` | Node.js FFmpeg wrapper |
| `archiver` | Zip file creation |

## Project Structure

```
VOICES/
├── package.json              # Dependencies, scripts, and build config
├── package-lock.json         # Locked dependency versions
├── main.js                   # Electron main process (IPC handlers, FFmpeg split, zip)
├── preload.js                # Secure context bridge (IPC to renderer)
├── Launch SnipWave.vbs       # Double-click launcher (no terminal window)
├── .gitignore                # Git ignore rules
├── src/
│   ├── index.html            # Application UI (upload screen + editor screen)
│   ├── styles.css            # Dark-themed modern styling
│   ├── renderer.js           # Frontend logic (audio, waveform, cuts, segments)
│   └── icons/                # App icons
├── app images/
│   └── interface.png         # Application interface screenshot
├── CLAUDE.md                 # AI development instructions
└── README.md                 # This file
```

## License

MIT
