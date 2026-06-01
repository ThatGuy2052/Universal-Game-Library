# Universal Game Library

A simple desktop app to track all your PC games in one place — whether they came from Steam or are custom shortcuts you added yourself.

---

## Features

**Steam Integration**
Automatically finds and lists all of your installed Steam games. No setup required.

**Drag & Drop**
Have a game that isn't on Steam? Just drag its shortcut into the app and it gets added instantly.

**Storage Tracker**
See exactly how much drive space each game is using, right on the game card.

**Clean Dashboard**
A simple grid layout with clear **STEAM** and **CUSTOM** tags so you always know where each game came from.

**Easy Updates**
Installing a new version takes one click. Your saved games, settings, and playtime data are never affected.

---

## Built With

- [Electron](https://www.electronjs.org/) — desktop app shell
- [React](https://react.dev/) — UI
- [Vite](https://vitejs.dev/) — build tooling
- [Tailwind CSS](https://tailwindcss.com/) — styling

---

## Getting Started

**1. Clone the repo and install dependencies**

```bash
git clone https://github.com/your-username/universal-game-library.git
cd universal-game-library
npm install
```

**2. Run the app in development mode**

```bash
npm run dev
```

**3. Build the Windows installer**

```bash
npm run dist
```

The installer will be saved to the `dist_electron/` folder.

---

## Your Data

Everything is stored locally on your machine in `%APPDATA%/GameLibraryManager/`. Nothing is sent anywhere.

---

**Version 1.1.0**


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
