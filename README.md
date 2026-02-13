# VOICES — Audio Multi-Cutter & Zipper

A sleek desktop application to split long audio files into multiple segments at precise positions and export them as a zip archive.

![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-Windows-blue)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

- **Audio Upload** — Drag-and-drop or browse for audio files (MP3, WAV, OGG, FLAC, M4A, AAC)
- **Waveform Visualization** — Visual waveform rendered on canvas for easy navigation
- **Precise Playback Controls** — Play, pause, stop, and seek with 0.1-second precision
- **Multi-Cut Marking** — Mark multiple cut positions on the timeline with visual markers
- **One-Click Split & Zip** — Split audio at all marked positions and download as a zip file
- **Keyboard Shortcuts** — Space (play/pause), Arrow keys (±0.1s seek), M (mark cut)
- **Dark Theme** — Modern, sleek dark UI

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- npm (comes with Node.js)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/voices.git
cd voices

# Install dependencies
npm install

# Launch the app
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
4. **Review cut points** in the list below the controls — click to jump, × to remove
5. **Click "Split & Zip"** to choose an output location and generate the zip with all segments

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Space` | Play / Pause |
| `←` | Seek back 0.1s |
| `→` | Seek forward 0.1s |
| `M` | Mark cut at current position |

## Tech Stack

- **Electron** — Desktop application framework
- **Web Audio API** — Audio decoding and playback
- **Canvas API** — Waveform visualization
- **FFmpeg** (via `ffmpeg-static` + `fluent-ffmpeg`) — Lossless audio splitting
- **Archiver** — Zip file creation

## Project Structure

```
VOICES/
├── package.json          # Dependencies and scripts
├── main.js               # Electron main process
├── preload.js            # Secure IPC bridge
├── src/
│   ├── index.html        # Application UI
│   ├── styles.css        # Dark-themed styling
│   └── renderer.js       # Frontend logic
├── CLAUDE.md             # AI development instructions
└── README.md             # This file
```

## License

MIT
