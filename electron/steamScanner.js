/**
 * steamScanner.js — Scans local Steam installation for installed games
 * by parsing appmanifest_*.acf files from all library folders.
 */
const fs   = require('fs')
const path = require('path')
const os   = require('os')

// ── Candidate Steam root paths per OS ──────────────────────────────────────
function getSteamRoots() {
  const plat = process.platform
  if (plat === 'win32') {
    return [
      'C:\\Program Files (x86)\\Steam',
      'C:\\Program Files\\Steam',
      path.join(os.homedir(), 'AppData', 'Local', 'Steam'),
    ]
  }
  if (plat === 'darwin') {
    return [path.join(os.homedir(), 'Library', 'Application Support', 'Steam')]
  }
  // Linux
  return [
    path.join(os.homedir(), '.steam', 'steam'),
    path.join(os.homedir(), '.local', 'share', 'Steam'),
  ]
}

// ── Parse a .acf VDF key-value file (simple non-nested parser) ─────────────
function parseAcf(filePath) {
  try {
    const text   = fs.readFileSync(filePath, 'utf-8')
    const result = {}
    const re     = /"([^"]+)"\s+"([^"]*)"/g
    let match
    while ((match = re.exec(text)) !== null) {
      result[match[1].toLowerCase()] = match[2]
    }
    return result
  } catch {
    return null
  }
}

// ── Find all steamapps directories from libraryfolders.vdf ─────────────────
function getLibraryPaths(steamRoot) {
  const mainLibrary  = path.join(steamRoot, 'steamapps')
  const vdfPath      = path.join(mainLibrary, 'libraryfolders.vdf')
  const libraries    = [mainLibrary]

  if (!fs.existsSync(vdfPath)) return libraries

  try {
    const text = fs.readFileSync(vdfPath, 'utf-8')
    // Match "path" keys that look like folder paths
    const re   = /"path"\s+"([^"]+)"/gi
    let m
    while ((m = re.exec(text)) !== null) {
      const libPath = path.join(m[1].replace(/\\\\/g, '\\'), 'steamapps')
      if (fs.existsSync(libPath) && !libraries.includes(libPath)) {
        libraries.push(libPath)
      }
    }
  } catch { /* ignore */ }

  return libraries
}

function getSteamSizeOnDiskBytes(appIdInput) {
  const appId = String(appIdInput ?? '').trim()
  if (!appId) return null

  for (const root of getSteamRoots()) {
    if (!fs.existsSync(root)) continue

    for (const libPath of getLibraryPaths(root)) {
      const manifestPath = path.join(libPath, `appmanifest_${appId}.acf`)
      if (!fs.existsSync(manifestPath)) continue

      const acf = parseAcf(manifestPath)
      if (!acf) continue

      const bytes = Number(acf['sizeondisk'] ?? acf['sizeofdisk'])
      if (Number.isFinite(bytes) && bytes > 0) {
        return bytes
      }
    }
  }

  return null
}

// ── Main scan function ───────────────────────────────────────────────────────
function scan() {
  const games = []

  for (const root of getSteamRoots()) {
    if (!fs.existsSync(root)) continue

    for (const libPath of getLibraryPaths(root)) {
      if (!fs.existsSync(libPath)) continue

      let entries
      try { entries = fs.readdirSync(libPath) } catch { continue }

      for (const entry of entries) {
        if (!entry.startsWith('appmanifest_') || !entry.endsWith('.acf')) continue

        const acf    = parseAcf(path.join(libPath, entry))
        if (!acf) continue

        const appid  = acf['appid']
        const name   = acf['name']
        if (!appid || !name) continue

        // Construct standard exe path heuristic (Windows)
        const installDir  = acf['installdir'] ?? name
        const exeBasePath = path.join(libPath, 'common', installDir)

        games.push({
          steam_appid:    appid,
          title:          name,
          exe_path:       exeBasePath,
          platform:       'steam',
          cover_url:      `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`,
          install_status: 'installed',
          size_on_disk:   acf['sizeondisk'] ?? acf['sizeofdisk'] ?? '0',
          last_updated:   acf['lastupdated'] ? parseInt(acf['lastupdated'], 10) : null,
        })
      }
    }
  }

  return games
}

module.exports = { scan, getSteamSizeOnDiskBytes }
