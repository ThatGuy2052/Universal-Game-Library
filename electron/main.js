const { app, BrowserWindow, ipcMain, dialog, shell, protocol } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const sharp = require('sharp')

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'custom-cover',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      bypassCSP: true,
    },
  },
])

// ── Determine if we're in dev mode ──────────────────────────────────────────
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// ── Simple preferences store (plain JSON, no native deps) ──────────────────
const prefs = (() => {
  let prefsPath = null
  let _data = {}

  function load() {
    if (!prefsPath) {
      prefsPath = require('path').join(app.getPath('appData'), 'GameLibraryManager', 'prefs.json')
    }
    try { _data = JSON.parse(require('fs').readFileSync(prefsPath, 'utf-8')) } catch { _data = {} }
  }

  function save() {
    try {
      require('fs').mkdirSync(require('path').dirname(prefsPath), { recursive: true })
      require('fs').writeFileSync(prefsPath, JSON.stringify(_data, null, 2), 'utf-8')
    } catch { /* best effort */ }
  }

  return {
    get:  (key) => { load(); return _data[key] ?? null },
    set:  (key, val) => { load(); _data[key] = val; save() },
  }
})()

const store = prefs

// ── Import our modules ───────────────────────────────────────────────────────
const db            = require('./database')
const fileWatcher   = require('./fileWatcher')
const steamScanner  = require('./steamScanner')
const gameProcess   = require('./gameProcess')
const exeIcon       = require('./exeIcon')

let mainWindow = null
const SIZE_SCAN_REVISION = 6

let cachedSteamAppsFolders = null

function bytesToGb(bytes) {
  const numeric = Number(bytes)
  if (!Number.isFinite(numeric) || numeric <= 0) return 0
  return Math.round((numeric / (1024 * 1024 * 1024)) * 100) / 100
}

function getSteamRootCandidates() {
  const platform = process.platform
  if (platform === 'win32') {
    return [
      'C:\\Program Files (x86)\\Steam',
      'C:\\Program Files\\Steam',
      path.join(os.homedir(), 'AppData', 'Local', 'Steam'),
    ]
  }
  if (platform === 'darwin') {
    return [path.join(os.homedir(), 'Library', 'Application Support', 'Steam')]
  }
  return [
    path.join(os.homedir(), '.steam', 'steam'),
    path.join(os.homedir(), '.local', 'share', 'Steam'),
  ]
}

function parseSteamLibraryFoldersVdf(vdfPath) {
  const folders = []
  if (!fs.existsSync(vdfPath)) return folders

  try {
    const text = fs.readFileSync(vdfPath, 'utf-8')
    const regex = /"path"\s+"([^"]+)"/gi
    let match
    while ((match = regex.exec(text)) !== null) {
      const libraryPath = match[1].replace(/\\\\/g, '\\')
      if (libraryPath) folders.push(libraryPath)
    }
  } catch {
    // Best effort.
  }

  return folders
}

function getSteamAppsFolders(options = {}) {
  const forceRefresh = options.forceRefresh === true
  if (!forceRefresh && Array.isArray(cachedSteamAppsFolders)) return cachedSteamAppsFolders

  const folders = new Set()

  // Primary discovery from Steam roots and declared libraryfolders.vdf entries.
  for (const root of getSteamRootCandidates()) {
    if (!fs.existsSync(root)) continue

    const defaultSteamApps = path.join(root, 'steamapps')
    if (fs.existsSync(defaultSteamApps)) folders.add(defaultSteamApps)

    const vdfPath = path.join(defaultSteamApps, 'libraryfolders.vdf')
    const vdfLibraries = parseSteamLibraryFoldersVdf(vdfPath)
    for (const lib of vdfLibraries) {
      const steamAppsPath = path.join(lib, 'steamapps')
      if (fs.existsSync(steamAppsPath)) folders.add(steamAppsPath)
    }
  }

  // Add common non-primary Steam library locations on Windows.
  if (process.platform === 'win32') {
    for (let i = 67; i <= 90; i += 1) {
      const drive = String.fromCharCode(i)
      const candidates = [
        `${drive}:\\SteamLibrary\\steamapps`,
        `${drive}:\\Games\\SteamLibrary\\steamapps`,
        `${drive}:\\Steam\\steamapps`,
        `${drive}:\\Games\\Steam\\steamapps`,
        `${drive}:\\Program Files (x86)\\Steam\\steamapps`,
        `${drive}:\\Program Files\\Steam\\steamapps`,
      ]
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) folders.add(path.normalize(candidate))
      }
    }
  }

  // Derive steamapps roots from already-known Steam game exe paths in DB.
  try {
    for (const game of db.getAllGames()) {
      if (String(game.platform ?? '').toLowerCase() !== 'steam') continue
      const exePath = typeof game.exe_path === 'string' ? game.exe_path : ''
      if (!exePath) continue
      const normalized = path.normalize(exePath)
      const marker = `${path.sep}steamapps${path.sep}`
      const idx = normalized.toLowerCase().indexOf(marker.toLowerCase())
      if (idx === -1) continue
      const steamAppsRoot = normalized.slice(0, idx + marker.length - 1)
      if (fs.existsSync(steamAppsRoot)) folders.add(path.normalize(steamAppsRoot))
    }
  } catch {
    // Best effort.
  }

  cachedSteamAppsFolders = Array.from(folders)
  return cachedSteamAppsFolders
}

function parseSteamManifestInfo(manifestPath) {
  try {
    const manifestText = fs.readFileSync(manifestPath, 'utf-8')
    const sizeMatch = manifestText.match(/"(?:SizeOnDisk|sizeondisk|sizeofdisk)"\s+"(\d+)"/i)
    const installMatch = manifestText.match(/"installdir"\s+"([^"]+)"/i)

    const bytes = sizeMatch ? Number(sizeMatch[1]) : 0
    const installDir = installMatch ? installMatch[1] : null

    return {
      bytes: Number.isFinite(bytes) && bytes > 0 ? bytes : 0,
      installDir: installDir && typeof installDir === 'string' ? installDir.trim() : null,
    }
  } catch {
    return { bytes: 0, installDir: null }
  }
}

// Find appmanifest_<appId>.acf in a steamapps dir with case-insensitive filename matching.
function findManifestCaseInsensitive(steamAppsDir, appId) {
  const target = `appmanifest_${appId}.acf`.toLowerCase()
  try {
    const entries = fs.readdirSync(steamAppsDir)
    const match = entries.find(e => e.toLowerCase() === target)
    return match ? path.join(steamAppsDir, match) : null
  } catch {
    return null
  }
}

function getSteamManifestInfo(appIdInput, options = {}) {
  const appId = String(appIdInput ?? '').trim()
  if (!appId) return { sizeGb: 0, installDirPath: null, manifestPath: null }

  const resolveFromManifestPath = (manifestPath) => {
    const parsed = parseSteamManifestInfo(manifestPath)
    const steamAppsDir = path.dirname(manifestPath)
    const installDirPath = parsed.installDir ? path.join(steamAppsDir, 'common', parsed.installDir) : null

    return {
      sizeGb: bytesToGb(parsed.bytes),
      installDirPath: installDirPath && fs.existsSync(installDirPath) ? path.normalize(installDirPath) : null,
      manifestPath,
    }
  }

  const steamAppsFolders = getSteamAppsFolders({ forceRefresh: options.forceRefresh === true })
  for (const steamAppsDir of steamAppsFolders) {
    const manifestPath = findManifestCaseInsensitive(steamAppsDir, appId)
    if (!manifestPath) continue
    return resolveFromManifestPath(manifestPath)
  }

  // CS2-specific secondary sweep for non-standard Steam library roots.
  if (appId === '730' && process.platform === 'win32') {
    for (let i = 67; i <= 90; i += 1) {
      const drive = String.fromCharCode(i)
      const extraSteamAppsDirs = [
        `${drive}:\\SteamLibrary\\steamapps`,
        `${drive}:\\Games\\SteamLibrary\\steamapps`,
        `${drive}:\\Steam\\steamapps`,
        `${drive}:\\Games\\Steam\\steamapps`,
        `${drive}:\\Program Files (x86)\\Steam\\steamapps`,
        `${drive}:\\Program Files\\Steam\\steamapps`,
      ]

      for (const steamAppsDir of extraSteamAppsDirs) {
        const manifestPath = findManifestCaseInsensitive(steamAppsDir, appId)
        if (!manifestPath) continue
        return resolveFromManifestPath(manifestPath)
      }
    }
  }

  return { sizeGb: 0, installDirPath: null, manifestPath: null }
}

function getSteamManifestSizeGb(appIdInput, options = {}) {
  return getSteamManifestInfo(appIdInput, options).sizeGb
}

async function getFolderSize(dirPath) {
  if (!dirPath || typeof dirPath !== 'string') {
    throw new Error('Invalid directory path.')
  }

  const rootAbs = path.resolve(dirPath)
  const rootWithSep = `${rootAbs}${path.sep}`

  const isInsideRoot = (candidatePath) => {
    const abs = path.resolve(candidatePath)
    return abs === rootAbs || abs.startsWith(rootWithSep)
  }

  let rootStat
  try {
    rootStat = fs.lstatSync(rootAbs)
  } catch (error) {
    throw new Error(`Cannot access root path: ${rootAbs}. ${error.message}`)
  }

  if (rootStat.isSymbolicLink()) {
    throw new Error(`Root path is a symbolic link: ${rootAbs}`)
  }
  if (!rootStat.isDirectory()) {
    throw new Error(`Root path is not a directory: ${rootAbs}`)
  }

  let totalBytes = 0
  const stack = [rootAbs]

  while (stack.length > 0) {
    const currentDir = stack.pop()
    if (!currentDir) continue
    if (!isInsideRoot(currentDir)) continue

    let currentDirStat
    try {
      currentDirStat = fs.lstatSync(currentDir)
    } catch {
      continue
    }
    if (!currentDirStat.isDirectory() || currentDirStat.isSymbolicLink()) continue

    let entries
    try {
      entries = await fs.promises.readdir(currentDir, { withFileTypes: true })
    } catch (error) {
      console.log(`[SizeScanner] Skipping unreadable directory ${currentDir}:`, error?.message ?? error)
      continue
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name)
      if (!isInsideRoot(fullPath)) continue

      let entryStat
      try {
        // Use lstat to avoid following symlinks/junctions and accidentally overcounting.
        entryStat = fs.lstatSync(fullPath)
      } catch {
        continue
      }

      if (entryStat.isSymbolicLink()) continue

      if (entryStat.isDirectory()) {
        stack.push(fullPath)
        continue
      }

      if (entryStat.isFile()) {
        try {
          if (Number.isFinite(entryStat.size) && entryStat.size > 0) totalBytes += entryStat.size
        } catch {
          // Best effort: ignore locked or inaccessible files.
        }
      }
    }
  }

  return bytesToGb(totalBytes)
}

function resolveGameInstallDirectory(game) {
  const candidates = [
    { key: 'source_dir', value: game.source_dir },
    { key: 'sourceDir', value: game.sourceDir },
    { key: 'installDir', value: game.installDir },
    { key: 'install_dir', value: game.install_dir },
    { key: 'gamePath', value: game.gamePath },
    { key: 'game_path', value: game.game_path },
    { key: 'path', value: game.path },
    { key: 'dir', value: game.dir },
    { key: 'exe_path', value: game.exe_path },
    { key: 'exePath', value: game.exePath },
    { key: 'launch_path', value: game.launch_path },
    { key: 'launchPath', value: game.launchPath },
  ]

  for (const candidate of candidates) {
    if (!candidate.value || typeof candidate.value !== 'string') continue
    const rawPath = candidate.value.trim()
    if (!rawPath) continue

    let resolvedPath
    try {
      resolvedPath = path.resolve(rawPath)
    } catch {
      continue
    }

    if (!fs.existsSync(resolvedPath)) continue

    try {
      const stats = fs.lstatSync(resolvedPath)
      if (stats.isSymbolicLink()) continue
      if (stats.isDirectory()) return { dir: resolvedPath, key: candidate.key }
      if (stats.isFile()) return { dir: path.dirname(resolvedPath), key: candidate.key }
    } catch {
      continue
    }
  }

  return { dir: null, key: null }
}

async function runStartupSizeSweep(options = {}) {
  const forceRescan = options.forceRescan === true
  const games = db.getAllGames()
  let updated = 0

  for (const game of games) {
    try {
      const currentSize = Number.parseFloat(game.size)
      const steamAppId =
        game.steam_appid ??
        game.steamAppId ??
        game.appId ??
        game.appid ??
        null

      const isSteamGame =
        String(game.platform ?? '').toLowerCase() === 'steam' ||
        game.steam === true ||
        game.isSteam === true ||
        !!steamAppId

      const hasStoredSize = !forceRescan && !isSteamGame && Number.isFinite(currentSize) && currentSize > 0

      let nextSizeGb = hasStoredSize ? currentSize : 0

      let resolvedSteamInstallDir = null

      if (isSteamGame && steamAppId) {
        const isCs2 = String(steamAppId) === '730'
        const manifestInfo = getSteamManifestInfo(steamAppId, { forceRefresh: isCs2 })
        const manifestSizeGb = manifestInfo.sizeGb
        resolvedSteamInstallDir = manifestInfo.installDirPath

        if (manifestSizeGb > 0) {
          nextSizeGb = manifestSizeGb
          console.log(`[SizeScanner] ${game.title}: using Steam appmanifest SizeOnDisk for appId ${steamAppId} at ${manifestInfo.manifestPath}.`)
        } else {
          console.log(`[SizeScanner] ${game.title}: Steam appmanifest not found or missing SizeOnDisk for appId ${steamAppId}; falling back to folder scan.`)
        }
      }

      if (!(Number.isFinite(nextSizeGb) && nextSizeGb > 0)) {
        let installDir = null
        let installKey = null

        if (resolvedSteamInstallDir) {
          installDir = resolvedSteamInstallDir
          installKey = 'steam_manifest_install_dir'
        }

        if (!installDir && String(steamAppId ?? '') === '730') {
          const cs2Folders = [
            'Counter-Strike 2',
            'Counter-Strike Global Offensive',
          ]
          const steamAppsRoots = getSteamAppsFolders({ forceRefresh: true })
          for (const root of steamAppsRoots) {
            for (const folderName of cs2Folders) {
              const candidate = path.join(root, 'common', folderName)
              if (fs.existsSync(candidate)) {
                installDir = candidate
                installKey = 'cs2_known_folder_fallback'
                break
              }
            }
            if (installDir) break
          }
        }

        if (!installDir) {
          const resolved = resolveGameInstallDirectory(game)
          installDir = resolved.dir
          installKey = resolved.key
        }

        if (!installDir) {
          console.log(`[SizeScanner] ${game.title}: no valid install path found (checked steam manifest install dir and local path keys).`)
        } else {
          console.log(`[SizeScanner] ${game.title}: scanning ${installDir} (resolved via ${installKey}).`)
          nextSizeGb = await getFolderSize(installDir)
        }
      }

      const normalizedNext = Number.isFinite(nextSizeGb) && nextSizeGb > 0
        ? Math.round(nextSizeGb * 100) / 100
        : 0

      const normalizedCurrent = Number.isFinite(currentSize) && currentSize > 0
        ? Math.round(currentSize * 100) / 100
        : 0

      const patch = { size: parseFloat(normalizedNext) || 0 }
      if (String(steamAppId ?? '') === '730' && resolvedSteamInstallDir) {
        patch.exe_path = resolvedSteamInstallDir
      }

      const shouldUpdatePath =
        String(steamAppId ?? '') === '730' &&
        !!resolvedSteamInstallDir &&
        String(game.exe_path ?? '') !== String(resolvedSteamInstallDir)

      if (forceRescan || normalizedNext !== normalizedCurrent || shouldUpdatePath) {
        // DB layer persists synchronously (fs.writeFileSync temp + rename) on update/saveNow.
        db.updateGame(game.id, patch)
        db.saveNow?.()
        updated += 1
      }
    } catch (error) {
      console.log(`[SizeScanner] Error scanning ${game.title}:`, error?.message ?? error)
    }
  }

  console.log(`[SizeScanner] Startup sweep complete. Updated: ${updated}/${games.length}. Force rescan: ${forceRescan}`)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0e1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
    // icon: only set if asset exists to avoid Electron warnings
    ...(fs.existsSync(path.join(__dirname, '../assets/icon.png')) ? { icon: path.join(__dirname, '../assets/icon.png') } : {}),
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })

  // Ensure CSP allows custom-cover:// image loading while preserving existing policy.
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = details.responseHeaders || {}
    const key = Object.keys(responseHeaders).find(k => k.toLowerCase() === 'content-security-policy')
    const existing = key ? responseHeaders[key].join('; ') : ''

    const defaultImgSrc = "img-src 'self' data: custom-cover: custom-cover://* https://steamcdn-a.akamaihd.net https://shared.cloudflare.steamstatic.com https://cdn.cloudflare.steamstatic.com https://steamuserimages-a.akamaihd.net https://*.steamstatic.com https://*.akamaihd.net https: http: file:;"
    let next = existing

    if (!next) {
      next = defaultImgSrc
    } else if (/\bimg-src\b/i.test(next)) {
      next = next.replace(/img-src\s+([^;]*);?/i, (m, group) => {
        const tokens = new Set(group.split(/\s+/).filter(Boolean))
        tokens.add("'self'")
        tokens.add('data:')
        tokens.add('custom-cover:')
        tokens.add('custom-cover://*')
        tokens.add('https://steamcdn-a.akamaihd.net')
        tokens.add('https://shared.cloudflare.steamstatic.com')
        tokens.add('https://cdn.cloudflare.steamstatic.com')
        tokens.add('https://steamuserimages-a.akamaihd.net')
        tokens.add('file:')
        return `img-src ${Array.from(tokens).join(' ')};`
      })
    } else {
      next = `${next}; ${defaultImgSrc}`
    }

    responseHeaders['Content-Security-Policy'] = [next]
    callback({ responseHeaders })
  })

  // Pass the window reference to modules that need to push events
  gameProcess.setWindow(mainWindow)
  fileWatcher.setWindow(mainWindow)
}

app.whenReady().then(async () => {
  try {
    protocol.registerFileProtocol('custom-cover', (request, callback) => {
      try {
        const customCoversRoot = path.join(app.getPath('userData'), 'custom_covers')
        const coverCacheRoot = path.join(app.getPath('appData'), 'GameLibraryManager', 'CoverCache')
        const decodedUrl = decodeURIComponent(request.url)
        const relativeRaw = decodedUrl
          .replace(/^custom-cover:\/\//i, '')
          .replace(/\\/g, '/')
          .replace(/\/+$/, '')
          .replace(/^\/+/, '')

        let resolvedPath = null
        let normalizedRoot = null

        if (/^CoverCache\//i.test(relativeRaw)) {
          const tail = relativeRaw.replace(/^CoverCache\//i, '')
          resolvedPath = path.normalize(path.join(coverCacheRoot, tail))
          normalizedRoot = path.normalize(coverCacheRoot + path.sep)
        } else {
          const tail = relativeRaw
            .replace(/^custom_covers\//i, '')
            .replace(/^custom-covers\//i, '')
          .replace(/\\/g, '/')
          resolvedPath = path.normalize(path.join(customCoversRoot, tail))
          normalizedRoot = path.normalize(customCoversRoot + path.sep)
        }

        if (!resolvedPath.startsWith(normalizedRoot)) {
          callback({ error: -10 }) // net::ACCESS_DENIED
          return
        }
        if (!fs.existsSync(resolvedPath)) {
          callback({ error: -6 }) // net::ERR_FILE_NOT_FOUND
          return
        }
        callback({ path: resolvedPath })
      } catch (error) {
        console.error('[custom-cover] Failed to resolve path:', error)
        callback({ error: -2 }) // net::FAILED
      }
    })

    db.init()
    await flattenExistingCoverAssets()
    createWindow()

    // One-time migration-style force sweep to correct previously inflated values.
    const storedSizeScanRevision = Number(store.get('sizeScan:revision') ?? 0)
    const shouldForceRescan = storedSizeScanRevision < SIZE_SCAN_REVISION

    // Startup sweep: hydrate install sizes and persist immediately.
    runStartupSizeSweep({ forceRescan: shouldForceRescan }).then(() => {
      if (shouldForceRescan) {
        store.set('sizeScan:revision', SIZE_SCAN_REVISION)
      }
    }).catch((error) => {
      console.error('[size-scan] Startup sweep failed:', error)
    })

    // Start file watcher on the dropzone directory
    const dropZone = getDropZone()
    fs.mkdirSync(dropZone, { recursive: true })
    fileWatcher.start(dropZone)
  } catch (err) {
    console.error('[Main] Startup initialization failed:', err)
    app.quit()
    return
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  fileWatcher.stop()
  if (process.platform !== 'darwin') app.quit()
})

// ── Helper: get dropzone path ─────────────────────────────────────────────────
function getDropZone() {
  const custom = store.get('dropZonePath')
  if (custom && fs.existsSync(custom)) return custom
  return path.join(app.getPath('appData'), 'GameLibraryManager', 'DropZone')
}

function getCoverStorageDir() {
  const dir = path.join(app.getPath('userData'), 'custom_covers')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function getCoverCacheDir() {
  const dir = path.join(app.getPath('appData'), 'GameLibraryManager', 'CoverCache')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function resolveOutputFormat(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return { format: 'jpeg', ext: '.jpg' }
  if (ext === '.webp') return { format: 'webp', ext: '.webp' }
  return { format: 'png', ext: '.png' }
}

function buildStillPath(inputPath, outputExt) {
  const dir = path.dirname(inputPath)
  const base = path.basename(inputPath, path.extname(inputPath))
  let stillPath = path.join(dir, `${base}-still${outputExt}`)
  if (fs.existsSync(stillPath)) {
    stillPath = path.join(dir, `${base}-still-${Date.now()}${outputExt}`)
  }
  return stillPath
}

function absoluteCoverPathToProtocolUrl(absPath) {
  if (!absPath || typeof absPath !== 'string') return null
  const normalized = path.normalize(absPath)
  const customRoot = path.normalize(path.join(app.getPath('userData'), 'custom_covers'))
  const cacheRoot = path.normalize(path.join(app.getPath('appData'), 'GameLibraryManager', 'CoverCache'))

  const customRootWithSep = `${customRoot}${path.sep}`
  const cacheRootWithSep = `${cacheRoot}${path.sep}`

  if (normalized.startsWith(customRootWithSep)) {
    const rel = path.relative(app.getPath('userData'), normalized).replace(/\\/g, '/')
    return `custom-cover://${encodeURI(rel)}`
  }

  if (normalized.startsWith(cacheRootWithSep)) {
    const rel = path.relative(cacheRoot, normalized).replace(/\\/g, '/')
    return `custom-cover://${encodeURI(`CoverCache/${rel}`)}`
  }

  return null
}

function parseLegacyFileUrlToAbsolute(url) {
  if (typeof url !== 'string') return null
  if (!url.toLowerCase().startsWith('file://')) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'file:') return null
    let pathname = decodeURIComponent(parsed.pathname || '')

    // Windows file URLs are usually /C:/... and need the leading slash removed.
    if (process.platform === 'win32' && /^\/[a-zA-Z]:\//.test(pathname)) {
      pathname = pathname.slice(1)
    }

    return path.normalize(pathname)
  } catch {
    try {
      const withoutScheme = decodeURI(url.replace(/^file:\/\//i, ''))
      const normalized = path.normalize(withoutScheme)
      if (process.platform === 'win32' && /^\\[a-zA-Z]:\\/.test(normalized)) {
        return normalized.slice(1)
      }
      return normalized
    } catch {
      return null
    }
  }
}

function findExistingStillVariant(sourcePath) {
  if (!sourcePath || typeof sourcePath !== 'string') return null
  const normalized = path.normalize(sourcePath)
  const baseName = path.basename(normalized)
  if (fs.existsSync(normalized) && /-still(\.|-)/i.test(baseName)) {
    return normalized
  }

  const dir = path.dirname(normalized)
  if (!fs.existsSync(dir)) return null

  const stem = path.basename(normalized, path.extname(normalized))
  const preferredExts = ['.png', '.jpg', '.jpeg', '.webp']

  for (const ext of preferredExts) {
    const direct = path.join(dir, `${stem}-still${ext}`)
    if (fs.existsSync(direct)) return path.normalize(direct)
  }

  try {
    const files = fs.readdirSync(dir)
    const dynamicPrefix = `${stem}-still-`
    for (const name of files) {
      const lower = name.toLowerCase()
      if (!lower.startsWith(dynamicPrefix.toLowerCase())) continue
      if (!preferredExts.some(ext => lower.endsWith(ext))) continue
      const full = path.join(dir, name)
      if (fs.existsSync(full)) return path.normalize(full)
    }
  } catch {
    // Best effort only.
  }

  return null
}

function customCoverUrlToAbsolute(url) {
  if (typeof url !== 'string' || !url.toLowerCase().startsWith('custom-cover://')) return null
  try {
    const raw = decodeURIComponent(url.replace(/^custom-cover:\/\//i, ''))
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/\/+$/, '')

    if (/^CoverCache\//i.test(raw)) {
      const tail = raw.replace(/^CoverCache\//i, '')
      return path.normalize(path.join(getCoverCacheDir(), tail))
    }

    const tail = raw
      .replace(/^custom_covers\//i, '')
      .replace(/^custom-covers\//i, '')
    return path.normalize(path.join(getCoverStorageDir(), tail))
  } catch {
    return null
  }
}

async function writeFlattenedStill(inputPath, outputPath, format) {
  const pipeline = sharp(inputPath, {
    page: 0,
    pages: 1,
    animated: false,
    failOn: 'none',
  })

  if (format === 'jpeg') {
    pipeline.jpeg({ quality: 90, mozjpeg: true })
  } else if (format === 'webp') {
    pipeline.webp({ quality: 90 })
  } else {
    pipeline.png()
  }

  const buffer = await pipeline.toBuffer()
  fs.writeFileSync(outputPath, buffer)
}

async function flattenExistingCoverAssets() {
  const roots = [getCoverStorageDir(), getCoverCacheDir()]
  let scanned = 0
  let flattened = 0
  const replacementMap = new Map()

  for (const root of roots) {
    const stack = [root]
    while (stack.length > 0) {
      const current = stack.pop()
      if (!current || !fs.existsSync(current)) continue

      const entries = fs.readdirSync(current, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(current, entry.name)
        if (entry.isDirectory()) {
          stack.push(fullPath)
          continue
        }
        if (!entry.isFile()) continue

        const ext = path.extname(entry.name).toLowerCase()
        if (!['.png', '.apng', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) continue
        if (/-still(\.|-)/i.test(entry.name)) continue

        scanned += 1
        try {
          const { format, ext: outExt } = resolveOutputFormat(fullPath)
          const stillPath = buildStillPath(fullPath, outExt)
          await writeFlattenedStill(fullPath, stillPath, format)
          replacementMap.set(path.normalize(fullPath), path.normalize(stillPath))

          // Optional cleanup: only remove original if unlocked.
          try {
            fs.unlinkSync(fullPath)
          } catch {
            // Locked file is okay; DB will point to new still file.
          }

          flattened += 1
        } catch (error) {
          console.error('[cover-flatten] Failed for file:', fullPath, error)
        }
      }
    }
  }

  if (replacementMap.size > 0) {
    const games = db.getAllGames()
    for (const game of games) {
      const candidates = []

      if (typeof game.cover_local === 'string' && game.cover_local.length > 0) {
        const localAsFileUrl = parseLegacyFileUrlToAbsolute(game.cover_local)
        candidates.push(path.normalize(localAsFileUrl || game.cover_local))
      }

      if (typeof game.cover_url === 'string' && game.cover_url.length > 0) {
        const asLegacyFile = parseLegacyFileUrlToAbsolute(game.cover_url)
        if (asLegacyFile) candidates.push(path.normalize(asLegacyFile))

        const asCustomCover = customCoverUrlToAbsolute(game.cover_url)
        if (asCustomCover) candidates.push(path.normalize(asCustomCover))

        if (!asLegacyFile && !asCustomCover && path.isAbsolute(game.cover_url)) {
          candidates.push(path.normalize(game.cover_url))
        }
      }

      let nextCoverPath = null
      for (const candidate of candidates) {
        if (replacementMap.has(candidate)) {
          nextCoverPath = replacementMap.get(candidate)
          break
        }

        const existingStill = findExistingStillVariant(candidate)
        if (existingStill) {
          nextCoverPath = existingStill
          break
        }

        if (fs.existsSync(candidate)) {
          nextCoverPath = candidate
          break
        }
      }

      if (nextCoverPath) {
        const nextUrl = absoluteCoverPathToProtocolUrl(nextCoverPath)
        if (!nextUrl) {
          // Keep original values rather than replacing with a broken path.
          console.warn('[cover-flatten] Could not build custom-cover URL for:', nextCoverPath)
          continue
        }

        const shouldUpdate =
          game.cover_local !== nextCoverPath ||
          game.cover_url !== nextUrl

        if (shouldUpdate) {
          db.updateGame(game.id, {
            cover_local: nextCoverPath,
            cover_url: nextUrl,
          })

          // Force a disk write after each startup rewrite so cover paths survive restarts.
          db.saveNow?.()
        }
        continue
      }

      // If we couldn't resolve to a file, preserve the existing URL or migrate legacy file:// to protocol form.
      if (typeof game.cover_url === 'string' && game.cover_url.length > 0) {
        const asLegacyFile = parseLegacyFileUrlToAbsolute(game.cover_url)
        if (asLegacyFile) {
          const protocolUrl = absoluteCoverPathToProtocolUrl(asLegacyFile)
          if (protocolUrl && protocolUrl !== game.cover_url) {
            db.updateGame(game.id, { cover_url: protocolUrl })
            db.saveNow?.()
          }
        }
      }
    }
  }

  console.log(`[cover-flatten] Startup sweep complete. Scanned: ${scanned}, Flattened: ${flattened}`)
}

async function convertCoverToStaticStill(sourcePath, gameId) {
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    throw new Error('Selected image file does not exist.')
  }

  const outputDir = getCoverStorageDir()
  const { format, ext } = resolveOutputFormat(sourcePath)
  const outputPath = path.join(outputDir, `game-${gameId}-${Date.now()}-still${ext}`)

  // Force frame-zero static extraction for both animated and still images.
  await writeFlattenedStill(sourcePath, outputPath, format)

  return outputPath
}

async function withResolvedCover(game) {
  if (!game) return game
  const coverUrl = game.cover_url || game.cover_local || null
  return { ...game, cover_url: coverUrl, coverUrl }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  IPC HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

// ── Window controls ───────────────────────────────────────────────────────────
ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.on('window:close', () => mainWindow?.close())

// ── Database / Games ─────────────────────────────────────────────────────────
ipcMain.handle('games:getAll', async () => {
  const games = db.getAllGames()
  return Promise.all(games.map(withResolvedCover))
})
ipcMain.handle('games:add', async (_e, game) => {
  const payload = { ...game }
  const isSteam = String(payload.platform ?? '').toLowerCase() === 'steam'

  const parsedSize = Number.parseFloat(payload.size)
  payload.size = Number.isFinite(parsedSize) && parsedSize >= 0 ? parsedSize : 0

  if (!payload.exe_icon) {
    if (!isSteam && payload.exe_path) {
      payload.exe_icon = exeIcon.extractExeIconSync(payload.exe_path) ?? exeIcon.getFallbackIconDataUri()
    } else {
      payload.exe_icon = exeIcon.getFallbackIconDataUri()
    }
  }

  const created = db.addGame(payload)
  return withResolvedCover(created)
})
ipcMain.handle('games:update', async (_e, id, fields) => {
  const patch = { ...fields }
  if (patch.size !== undefined) {
    const parsedSize = Number.parseFloat(patch.size)
    patch.size = Number.isFinite(parsedSize) && parsedSize >= 0 ? parsedSize : 0
  }
  if (patch.exe_path && !patch.exe_icon) {
    patch.exe_icon = exeIcon.extractExeIconSync(patch.exe_path) ?? exeIcon.getFallbackIconDataUri()
  }
  const updated = db.updateGame(id, patch)
  return withResolvedCover(updated)
})
ipcMain.handle('games:delete', (_e, id) => db.deleteGame(id))
ipcMain.handle('games:getById', async (_e, id) => {
  const game = db.getGameById(id)
  return withResolvedCover(game)
})
ipcMain.handle('games:changeAppearance', async (_e, id) => {
  const game = db.getGameById(id)
  if (!game) return { success: false, error: 'Game not found' }

  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose Cover Image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    })

    if (result.canceled || !result.filePaths?.[0]) {
      return { success: false, canceled: true }
    }

    const sourcePath = result.filePaths[0]
    console.log('[games:changeAppearance] Selected source path:', sourcePath)
    const ext = path.extname(sourcePath).toLowerCase()
    const allowed = new Set(['.jpg', '.jpeg', '.png', '.webp'])
    if (!allowed.has(ext)) {
      return { success: false, error: 'Unsupported image format.' }
    }

    const staticPath = await convertCoverToStaticStill(sourcePath, id)
    console.log('[games:changeAppearance] Static destination path:', staticPath)

    const relativeCoverPath = path.relative(app.getPath('userData'), staticPath).replace(/\\/g, '/')
    const protocolCoverUrl = `custom-cover://${encodeURI(relativeCoverPath)}`
    console.log('[games:changeAppearance] Database cover_url value:', protocolCoverUrl)

    const updatedRaw = db.updateGame(id, {
      cover_local: staticPath,
      cover_url: protocolCoverUrl,
    })
    const updated = await withResolvedCover(updatedRaw)

    mainWindow?.webContents.send('cover-updated', {
      gameId: id,
      newPath: updated?.cover_url ?? updated?.cover_local ?? null,
      game: updated,
    })

    return { success: true, game: updated }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ── File picker ───────────────────────────────────────────────────────────────
ipcMain.handle('dialog:openExe', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Game Executable',
    properties: ['openFile'],
    filters: [
      { name: 'Executables', extensions: ['exe', 'sh', 'app', 'bat', 'cmd'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('dialog:openImage', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Cover Art',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Folder',
    properties: ['openDirectory'],
  })
  return result.canceled ? null : result.filePaths[0]
})

// ── Steam scanning ────────────────────────────────────────────────────────────
ipcMain.handle('steam:scan', () => {
  const scanned = steamScanner.scan()
  const existingByAppId = new Map(
    db.getAllGames()
      .filter(g => g.steam_appid)
      .map(g => [String(g.steam_appid), g])
  )

  const resolveSteamInfo = (appId, scannedGame, existingGame = null) => {
    const isCs2 = String(appId) === '730'
    const manifestInfo = getSteamManifestInfo(appId, { forceRefresh: isCs2 })

    const parsedFromScan = Number(scannedGame?.size_on_disk)
    const parsedFromScanGb = Number.isFinite(parsedFromScan) && parsedFromScan > 0
      ? Number((parsedFromScan / (1024 * 1024 * 1024)).toFixed(2))
      : 0

    const manifestSizeGb = Number.isFinite(manifestInfo.sizeGb) && manifestInfo.sizeGb > 0
      ? Number(manifestInfo.sizeGb.toFixed(2))
      : 0

    const existingSize = Number(existingGame?.size)
    const existingSizeGb = Number.isFinite(existingSize) && existingSize > 0
      ? Number(existingSize.toFixed(2))
      : 0

    const sizeGb = parsedFromScanGb || manifestSizeGb || existingSizeGb || 0
    const exePath = manifestInfo.installDirPath || scannedGame?.exe_path || existingGame?.exe_path || null

    return { sizeGb, exePath }
  }

  for (const sg of scanned) {
    const appId = String(sg.steam_appid)
    const existing = existingByAppId.get(appId)

    if (existing) {
      const resolved = resolveSteamInfo(appId, sg, existing)
      db.updateGame(existing.id, {
        title:          sg.title,
        exe_path:       resolved.exePath,
        platform:       'steam',
        cover_url:      sg.cover_url,
        install_status: sg.install_status,
        steam_appid:    appId,
        // Keep Steam and custom entries aligned on the same root size key.
        size:           resolved.sizeGb,
      })
      continue
    }

    const resolved = resolveSteamInfo(appId, sg)
    const added = db.addGame({ ...sg, exe_path: resolved.exePath, platform: 'steam', steam_appid: appId, size: resolved.sizeGb })
    existingByAppId.set(appId, added)
  }

  // Keep existing contract (returns scanned game list) while also syncing DB.
  return scanned
})

// ── Game launching / process tracking ────────────────────────────────────────
ipcMain.handle('game:launch', (_e, id) => gameProcess.launch(id))
ipcMain.handle('game:isRunning', (_e, id) => gameProcess.isRunning(id))
ipcMain.handle('game:stop', (_e, id) => gameProcess.stop(id))

// ── Conflict resolution ───────────────────────────────────────────────────
ipcMain.handle('game:resolveConflict', (_e, id, chosenExePath) => {
  const game = db.getGameById(id)
  if (!game) return { success: false, error: 'Game not found' }
  if (game.install_status !== 'pending_resolution') {
    return { success: false, error: 'Game is not in conflict state' }
  }
  // Validate chosen path is one of the known conflict candidates
  const candidates = Array.isArray(game.conflict_exes) ? game.conflict_exes : []
  if (!candidates.includes(chosenExePath)) {
    return { success: false, error: 'Chosen path is not a recognized conflict candidate' }
  }
  const updated = db.updateGame(id, {
    exe_path:       chosenExePath,
    exe_icon:       exeIcon.extractExeIconSync(chosenExePath) ?? exeIcon.getFallbackIconDataUri(),
    install_status: 'installed',
    conflict_exes:  [],  // clear conflict list
  })
  return { success: true, game: updated }
})

// ── Categories ───────────────────────────────────────────────────
ipcMain.handle('categories:getAll',    ()            => db.getAllCategories())
ipcMain.handle('categories:add',       (_e, name)    => db.addCategory(name))
ipcMain.handle('categories:update',    (_e, id, f)   => db.updateCategory(id, f))
ipcMain.handle('categories:delete',    (_e, id)      => db.deleteCategory(id))
ipcMain.handle('games:setTags',        (_e, gid, ids) => db.setGameTags(gid, ids))
ipcMain.handle('games:toggleLaunchSteam', (_e, id, nextValue) => {
  const game = db.getGameById(id)
  if (!game) return { success: false, error: 'Game not found' }

  const current = !!game.launch_steam_with_game
  const resolved = typeof nextValue === 'boolean' ? nextValue : !current
  const updated = db.updateGame(id, { launch_steam_with_game: resolved })
  return { success: true, game: updated }
})

// ── Settings / preferences ─────────────────────────────────────────────────
ipcMain.handle('settings:get', (_e, key) => store.get(key))
ipcMain.handle('settings:set', (_e, key, value) => { store.set(key, value) })
ipcMain.handle('settings:getDropZone', () => getDropZone())
ipcMain.handle('settings:setDropZone', (_e, newPath) => {
  if (!fs.existsSync(newPath)) return { success: false, error: 'Path does not exist' }
  store.set('dropZonePath', newPath)
  fileWatcher.stop()
  fs.mkdirSync(newPath, { recursive: true })
  fileWatcher.start(newPath)
  return { success: true }
})

// ── Shell open ────────────────────────────────────────────────────────────────
ipcMain.handle('shell:openPath', (_e, p) => shell.openPath(p))
