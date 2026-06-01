/**
 * fileWatcher.js — Monitors a DropZone folder for new game executables/folders.
 *
 * Rules:
 *  - Only `.exe` files are considered (strict filter; ignores zips, docs, etc.)
 *  - A bare `.exe` dropped directly → single-file game, registered immediately.
 *  - A folder dropped:
 *      • Exactly 1 .exe found → registered immediately as installed.
 *      • 2+ .exe files found  → PENDING_RESOLUTION; conflict list stored.
 *      • 0 .exe files found   → ignored silently.
 *  - Duplicate detection: if an exe_path (or source folder) is already in the
 *    DB (any status), it is skipped to prevent re-prompting resolved games.
 */
const path     = require('path')
const fs       = require('fs')
const chokidar = require('chokidar')
const db       = require('./database')
const exeIcon  = require('./exeIcon')

let watcher    = null
let mainWindow = null

function setWindow(win) { mainWindow = win }

// ── Helpers ──────────────────────────────────────────────────────────────────

/** True only for Windows PE executables */
function isExe(filePath) {
  return path.extname(filePath).toLowerCase() === '.exe'
}

/** Sanitise a file/folder name into a human-readable game title */
function nameToTitle(rawName) {
  return rawName
    .replace(/\.[^/.]+$/, '')               // strip extension
    .replace(/[_\-.]+/g, ' ')               // separators → spaces
    .replace(/([a-z])([A-Z])/g, '$1 $2')   // split CamelCase
    .replace(/\b\w/g, c => c.toUpperCase()) // title-case
    .trim()
}

/**
 * Recursively collect all .exe paths under `dir` up to `maxDepth` levels.
 * We stop at depth 2 (immediate children + one sub-level) to avoid scanning
 * entire game trees, while still catching installers in sub-folders.
 */
function collectExes(dir, depth = 0, maxDepth = 1) {
  let exes = []
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return exes }

  for (const ent of entries) {
    const full = path.join(dir, ent.name)
    if (ent.isFile() && isExe(full)) {
      exes.push(full)
    } else if (ent.isDirectory() && depth < maxDepth) {
      exes = exes.concat(collectExes(full, depth + 1, maxDepth))
    }
  }
  return exes
}

// ── Core handler ─────────────────────────────────────────────────────────────

function handleNewPath(entryPath) {
  try {
    const stat = fs.statSync(entryPath)
    const title = nameToTitle(path.basename(entryPath))

    if (stat.isFile()) {
      // ── Single .exe dropped directly ──────────────────────────────────────
      if (!isExe(entryPath)) return  // strict: ignore non-exe files

      // Duplicate check
      if (db.getAllGames().some(g => g.exe_path === entryPath)) return

      const newGame = db.addGame({
        title,
        exe_path:       entryPath,
        platform:       'custom',
        exe_icon:       exeIcon.extractExeIconSync(entryPath) ?? exeIcon.getFallbackIconDataUri(),
        install_status: 'installed',
        conflict_exes:  [],
      })
      mainWindow?.webContents.send('game:added', newGame)

    } else if (stat.isDirectory()) {
      // ── Folder dropped ────────────────────────────────────────────────────
      const exes = collectExes(entryPath)

      if (exes.length === 0) {
        // No exe at all — ignore
        return
      }

      // Duplicate check: skip if any exe from this folder is already registered
      // (covers re-scans after a conflict has been resolved)
      const allGames = db.getAllGames()
      const alreadyTracked = exes.some(e =>
        allGames.some(g => g.exe_path === e)
      ) || allGames.some(g =>
        // also match games whose source folder was this directory
        g.source_dir === entryPath
      )
      if (alreadyTracked) return

      if (exes.length === 1) {
        // ── Unambiguous ────────────────────────────────────────────────────
        const newGame = db.addGame({
          title,
          exe_path:       exes[0],
          platform:       'custom',
          exe_icon:       exeIcon.extractExeIconSync(exes[0]) ?? exeIcon.getFallbackIconDataUri(),
          install_status: 'installed',
          conflict_exes:  [],
          source_dir:     entryPath,
        })
        mainWindow?.webContents.send('game:added', newGame)

      } else {
        // ── Conflict: multiple .exe files ──────────────────────────────────
        const newGame = db.addGame({
          title,
          exe_path:       null,                    // not set until resolved
          platform:       'custom',
          exe_icon:       exeIcon.getFallbackIconDataUri(),
          install_status: 'pending_resolution',
          conflict_exes:  exes,
          source_dir:     entryPath,
        })
        mainWindow?.webContents.send('game:added',    newGame)
        mainWindow?.webContents.send('game:conflict', newGame)
      }
    }
  } catch (err) {
    console.error('[FileWatcher] Error handling path:', entryPath, err.message)
  }
}

// ── Chokidar watcher lifecycle ───────────────────────────────────────────────

function start(dropZonePath) {
  if (watcher) watcher.close()

  watcher = chokidar.watch(dropZonePath, {
    depth:        1,
    ignoreInitial: true,
    ignored: (watchedPath) => {
      // Always watch the root drop-zone dir itself and direct subfolders.
      // For files, only watch .exe files.
      const rel = path.relative(dropZonePath, watchedPath)
      if (rel === '' || rel === '.') return false  // root itself
      const parts = rel.split(path.sep)
      if (parts.length === 1) {
        // Direct child — allow folders and .exe files only
        const ext = path.extname(watchedPath).toLowerCase()
        return ext !== '' && ext !== '.exe'
      }
      return true // deeper than depth:1, let chokidar's depth handle it
    },
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval:       200,
    },
  })

  watcher.on('add',    handleNewPath)
  watcher.on('addDir', handleNewPath)
  watcher.on('error',  err => console.error('[FileWatcher] Error:', err))

  console.log('[FileWatcher] Watching:', dropZonePath)
}

function stop() {
  watcher?.close()
  watcher = null
}

module.exports = { start, stop, setWindow }

