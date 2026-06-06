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

function resolveSteamCachedIconPath(steamRoot, appIdInput, acf = null) {
  if (!steamRoot) return null
  const appId = String(appIdInput ?? '').trim()
  if (!appId) return null

  const iconHash = String(acf?.clienticon ?? acf?.icon ?? '').trim()
  if (process.platform === 'win32' && iconHash) {
    const steamIconPath = path.win32.join('C:', 'Program Files (x86)', 'Steam', 'steam', 'games', `${iconHash}.ico`)
    if (fs.existsSync(steamIconPath)) return path.win32.normalize(steamIconPath)
  }

  const iconDirs = [
    path.join(steamRoot, 'steam', 'games'),
    path.join(steamRoot, 'games'),
  ]

  for (const iconDir of iconDirs) {
    if (!fs.existsSync(iconDir)) continue

    if (iconHash) {
      const hashedIcoPath = path.join(iconDir, `${iconHash}.ico`)
      if (fs.existsSync(hashedIcoPath)) return path.normalize(hashedIcoPath)
    }

    const appIdIcoPath = path.join(iconDir, `${appId}.ico`)
    if (fs.existsSync(appIdIcoPath)) return path.normalize(appIdIcoPath)

    try {
      const icoCandidate = fs.readdirSync(iconDir)
        .find((entry) => entry.toLowerCase().endsWith('.ico') && entry.includes(appId))
      if (icoCandidate) return path.normalize(path.join(iconDir, icoCandidate))
    } catch {
      // Best effort lookup only.
    }
  }

  return null
}

function collectExeCandidates(dirPath, depth = 2) {
  const results = []
  if (!dirPath || depth < 0 || !fs.existsSync(dirPath)) return results

  let entries = []
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true })
  } catch {
    return results
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.exe')) {
      results.push(fullPath)
      continue
    }
    if (entry.isDirectory() && depth > 0) {
      results.push(...collectExeCandidates(fullPath, depth - 1))
    }
  }

  return results
}

function resolveSteamExecutablePath(libPath, acf) {
  const installDir = String(acf?.installdir ?? acf?.name ?? '').trim()
  if (!installDir) return null

  const exeBasePath = path.join(libPath, 'common', installDir)
  if (!fs.existsSync(exeBasePath)) return null

  const exeCandidates = collectExeCandidates(exeBasePath, 2)
  if (exeCandidates.length === 0) return null

  const preferredNames = [installDir, acf?.name, acf?.launcherpath]
    .filter(Boolean)
    .map(value => String(value).trim().toLowerCase())

  const preferred = exeCandidates.find((candidate) => {
    const candidateName = path.basename(candidate, path.extname(candidate)).toLowerCase()
    return preferredNames.some((name) => candidateName === name || candidateName.includes(name) || name.includes(candidateName))
  })

  return path.normalize(preferred ?? exeCandidates[0])
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
        const steamCachedIconPath = resolveSteamCachedIconPath(root, appid, acf)

        const exePath = resolveSteamExecutablePath(libPath, acf)

        games.push({
          steam_appid:    appid,
          title:          name,
          exe_path:       exePath,
          exe_icon:       steamCachedIconPath,
          icon:           steamCachedIconPath,
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
