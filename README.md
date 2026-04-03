# 🎬 ClipSync — YouTube Video & Audio Cutter

A premium, mobile-first web application designed to allow users to instantly grab, preview, trim, and download YouTube videos or songs, completely in their browser.

## ✨ Features

- **🔗 Paste & Fetch** — Paste any YouTube URL and instantly view video metadata (thumbnail, title, views, track duration).
- **✂️ Visual Trimmer** — Drag timeline handles to set your exact clip begin/end points (with touch support for mobile).
- **▶️ In-Browser Playback Preview** — Click "Preview" to actually hear and watch the exact sub-clip stream via the overlayed YouTube Player. The preview indicator syncs smoothly with the timeline.
- **🎵 MP3 Export** — Extract audio reliably in standard bitrates (128, 192, 320 kbps).
- **🎬 MP4 Export** — Download video in 360p, 720p, or 1080p outputs.
- **📱 Mobile-First Glassmorphism UI** — Premium, dark-themed responsive design featuring rich gradients, micro-animations, and fluid constraints for mobile devices.

## 🛠️ Architecture & Tech Stack

ClipSync entirely isolates its architecture:

- **Frontend (Vanilla HTML/CSS/JS + Vite)**: 
  Served cleanly with Vite in dev mode, relying on vanilla JavaScript for drag interactions to emulate a robust mobile app experience frameworklessly.
- **Backend (Express.js + Node.js)**: 
  A proxy API securely interacts with YouTube. 
- **Extraction (`youtube-dl-exec`)**: Bypasses complex YouTube URL signatures safely. It asks `yt-dlp` to extract the master stream, effectively shielding against frequent structure changes.
- **Processing (`ffmpeg-static` + `fluent-ffmpeg`)**: A bundled FFmpeg executable directly pipes YouTube's adaptive streams and trims the video sequentially, requiring absolutely zero system installations to format your audio or video smoothly.

## 🚀 Getting Started

### Prerequisites

Ensure you have **Node.js (v18.16.x or newer)** installed.

### Installation

1. Clone or navigate into the directory:
   ```bash
   cd youtubemp3cutter
   ```
2. Install the necessary NPM dependencies:
   ```bash
   npm install
   ```

### Running Locally

To spin up both the Vite frontend server and Express backend server simultaneously (handled cleanly via `concurrently`):

```bash
npm run dev
```

- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:3001

*When developing, Vite will proxy all calls originating from `/api/*` across to the Express backend perfectly, completely alleviating CORS issues.*

## 📂 Project Structure

```text
youtubemp3cutter/
├── index.html           # Main UI Application Shell
├── style.css            # Complete Styling & Glassmorphism Design System
├── main.js              # Application Logic (Trimmer, Previewing, Downloading)
├── vite.config.js       # Vite Server + API Proxy
├── package.json         # NPM Configurations
└── server/
    └── index.js         # Express Backend APIs (Download, Info, FFMPEG Wrapper)
```

## ⚖️ Disclaimer

ClipSync relies on public/streamed media. This project is created purely for educational/development purposes to demonstrate piping, asynchronous web environments, fluid CSS logic, and proxy architectures.
