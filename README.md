# Universal Game Library

> A lightweight, automated application manager for tracking your complete gaming footprint — across custom desktop shortcuts and major retail platforms — from a single unified dashboard.

---

## Features

### Platform Integration
Automatically detects and catalogs your installed Steam library by parsing background `appmanifest` data files across all configured Steam library paths, including secondary drives and non-standard install roots.

### DropZone Tracking
Drag any custom game shortcut or executable into the monitored DropZone folder to instantly register non-Steam and DRM-free titles. The watcher picks up additions and removals in real time without any manual input.

### Dynamic Footprint Storage Scanning
Asynchronous, recursive file-size calculations walk your entire game installation tree — including deeply nested folder structures from legacy or migrated installs such as Counter-Strike 2 — and surface accurate gigabyte figures to the UI immediately after each scan.

### Unified Dashboard UI
A context-aware card grid presents every tracked title with clear **STEAM** and **CUSTOM** source badges, precise asset sizes in GB, and sort controls so your largest or most recently added games surface at a glance.

### Hassle-Free Installer
The Windows NSIS installer performs a silent, one-click in-place upgrade for every new version. Local user data — play records, custom categories, and the game database stored in AppData — is never touched during an update or uninstall.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Application shell | Electron |
| Frontend bundler | Vite |
| UI framework | React |
| Styling | Tailwind CSS |
| Asset processing | Sharp |

---

## Development & Compilation

### Prerequisites
- Node.js 18 or later
- npm 9 or later

### 1 — Clone and install dependencies

```bash
git clone https://github.com/your-username/universal-game-library.git
cd universal-game-library
npm install
```

### 2 — Launch the development environment

```bash
npm run dev
```

This starts the Vite dev server and spawns an Electron window pointed at `localhost:5173`. Hot-module replacement is active for all frontend changes.

### 3 — Compile a production installer

```bash
npm run dist
```

Runs a clean Vite production build followed by `electron-builder --windows`, emitting a signed NSIS setup executable to `dist_electron/`.

---

## Data & Privacy

All game metadata, play statistics, and user preferences are stored exclusively in the local AppData folder on your machine (`%APPDATA%/GameLibraryManager/`). No data is transmitted externally.

---

## Version

Current release: **v1.1.0**
